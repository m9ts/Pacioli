import { Injectable } from '@nestjs/common';
import { AccountClassification, AccountNature, AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { dec } from '../common/utils/decimal';
import { compareAccountCode } from '../common/utils/account-code';
import { endOfDay, startOfDay } from '../common/utils/date';

export interface AccountMovementRow {
  id: string;
  code: string;
  name: string;
  classification: AccountClassification;
  nature: AccountNature;
  type: AccountType;
  statementGroup: string | null;
  dreGroup: string | null;
  referenceCode: string | null;
  active: boolean;
  parentId: string | null;
  openingNet: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
  closingNet: Prisma.Decimal;
}

interface AggregateMap {
  [accountId: string]: { debit: Prisma.Decimal; credit: Prisma.Decimal };
}

/**
 * Motor de saldos: toda a apuração parte exclusivamente das linhas do Livro Diário.
 */
@Injectable()
export class BalancesService {
  constructor(private readonly prisma: PrismaService) {}

  private async aggregate(
    companyId: string,
    dateFilter: Prisma.DateTimeFilter,
    excludeClosing = false,
  ): Promise<AggregateMap> {
    const grouped = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        entry: {
          companyId,
          date: dateFilter,
          ...(excludeClosing ? { NOT: { source: 'ENCERRAMENTO' } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });

    const map: AggregateMap = {};
    for (const row of grouped) {
      map[row.accountId] = {
        debit: dec(row._sum.debit),
        credit: dec(row._sum.credit),
      };
    }
    return map;
  }

  async movements(
    companyId: string,
    options: { from?: string | Date | null; to: string | Date; excludeClosing?: boolean },
  ): Promise<AccountMovementRow[]> {
    const to = endOfDay(options.to);
    const from = options.from ? startOfDay(options.from) : null;
    const excludeClosing = options.excludeClosing ?? false;

    const [accounts, upTo, before] = await Promise.all([
      this.prisma.account.findMany({ where: { companyId } }),
      this.aggregate(companyId, { lte: to }, excludeClosing),
      from
        ? this.aggregate(companyId, { lt: from }, excludeClosing)
        : Promise.resolve({} as AggregateMap),
    ]);

    const rows = accounts.map((account) => {
      const closing = upTo[account.id] ?? { debit: dec(0), credit: dec(0) };
      const opening = before[account.id] ?? { debit: dec(0), credit: dec(0) };
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        classification: account.classification,
        nature: account.nature,
        type: account.type,
        statementGroup: account.statementGroup,
        dreGroup: account.dreGroup,
        referenceCode: account.referenceCode,
        active: account.active,
        parentId: account.parentId,
        openingNet: opening.debit.minus(opening.credit),
        periodDebit: closing.debit.minus(opening.debit),
        periodCredit: closing.credit.minus(opening.credit),
        closingNet: closing.debit.minus(closing.credit),
      } satisfies AccountMovementRow;
    });

    rows.sort((a, b) => compareAccountCode(a.code, b.code));
    return rows;
  }

  /** Soma os saldos das contas filhas nos nós sintéticos (roll-up hierárquico). */
  rollup(rows: AccountMovementRow[]): Map<string, Prisma.Decimal> {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const totals = new Map<string, Prisma.Decimal>();
    rows.forEach((row) => totals.set(row.id, row.closingNet));

    const depth = (row: AccountMovementRow) => row.code.split('.').length;
    const sorted = [...rows].sort((a, b) => depth(b) - depth(a));
    for (const row of sorted) {
      if (!row.parentId) continue;
      const parent = byId.get(row.parentId);
      if (!parent) continue;
      totals.set(parent.id, (totals.get(parent.id) ?? dec(0)).plus(totals.get(row.id) ?? dec(0)));
    }
    return totals;
  }

  /** Resultado do exercício acumulado: receitas − custos − despesas. */
  resultFromRows(rows: AccountMovementRow[]): Prisma.Decimal {
    return rows.reduce((acc, row) => {
      if (row.classification === AccountClassification.RECEITA) {
        return acc.plus(row.closingNet.negated());
      }
      if (
        row.classification === AccountClassification.CUSTO ||
        row.classification === AccountClassification.DESPESA
      ) {
        // Saldos devedores de custo/despesa reduzem o resultado.
        return acc.minus(row.closingNet);
      }
      return acc;
    }, dec(0));
  }

  /** Totais patrimoniais a partir das contas analíticas. */
  statementTotals(rows: AccountMovementRow[]) {
    let ativo = dec(0);
    let passivo = dec(0);
    let patrimonioLiquido = dec(0);

    for (const row of rows) {
      if (row.type !== AccountType.ANALITICA) continue;
      if (row.classification === AccountClassification.ATIVO) {
        ativo = ativo.plus(row.closingNet);
      } else if (row.classification === AccountClassification.PASSIVO) {
        passivo = passivo.plus(row.closingNet.negated());
      } else if (row.classification === AccountClassification.PATRIMONIO_LIQUIDO) {
        patrimonioLiquido = patrimonioLiquido.plus(row.closingNet.negated());
      }
    }

    const resultadoExercicio = this.resultFromRows(
      rows.filter((row) => row.type === AccountType.ANALITICA),
    );
    patrimonioLiquido = patrimonioLiquido.plus(resultadoExercicio);

    return { ativo, passivo, patrimonioLiquido, resultadoExercicio };
  }

  /** Saldo devedor/credor de um valor líquido (débito − crédito). */
  splitBalance(net: Prisma.Decimal) {
    return net.greaterThanOrEqualTo(0)
      ? { debit: net, credit: dec(0) }
      : { debit: dec(0), credit: net.negated() };
  }
}
