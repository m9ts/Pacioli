import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountClassification,
  AccountNature,
  AccountType,
  DreGroup,
  JournalSource,
  PeriodStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { BalancesService, AccountMovementRow } from './balances.service';
import { JournalService, PostingLine } from '../journal/journal.service';
import { AuditService } from '../audit/audit.service';
import { dec, money } from '../common/utils/decimal';
import {
  endOfDay,
  firstDayOfMonth,
  formatPeriodLabel,
  lastDayOfMonth,
  monthsBetween,
  startOfDay,
  toISODate,
} from '../common/utils/date';
import { BalanceSheetQueryDto, ClosingDto, DreQueryDto, LedgerQueryDto, PeriodQueryDto } from './dto/report.dto';

const num = (value: Prisma.Decimal | number | string) => Number(dec(value).toFixed(2));
const round2 = (value: Prisma.Decimal) => money(value);

const GROUP_LABELS: Record<string, string> = {
  ATIVO_CIRCULANTE: 'Ativo Circulante',
  ATIVO_NAO_CIRCULANTE: 'Ativo Não Circulante',
  PASSIVO_CIRCULANTE: 'Passivo Circulante',
  PASSIVO_NAO_CIRCULANTE: 'Passivo Não Circulante',
  PATRIMONIO_LIQUIDO: 'Patrimônio Líquido',
};

const DRE_GROUPS: { key: DreGroup; label: string; kind: 'receita' | 'despesa' }[] = [
  { key: DreGroup.RECEITA_BRUTA, label: 'Receita Bruta', kind: 'receita' },
  { key: DreGroup.DEDUCAO_RECEITA, label: 'Deduções da Receita', kind: 'despesa' },
  { key: DreGroup.CMV, label: 'Custo das Mercadorias Vendidas (CMV)', kind: 'despesa' },
  { key: DreGroup.DESPESA_ADMINISTRATIVA, label: 'Despesas Administrativas', kind: 'despesa' },
  { key: DreGroup.DESPESA_VENDAS, label: 'Despesas com Vendas', kind: 'despesa' },
  { key: DreGroup.DESPESA_FINANCEIRA, label: 'Despesas Financeiras', kind: 'despesa' },
  { key: DreGroup.RECEITA_FINANCEIRA, label: 'Receitas Financeiras', kind: 'receita' },
  { key: DreGroup.OUTRAS_RECEITAS, label: 'Outras Receitas', kind: 'receita' },
  { key: DreGroup.OUTRAS_DESPESAS, label: 'Outras Despesas', kind: 'despesa' },
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: BalancesService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  private async resolveRange(companyId: string, query: PeriodQueryDto) {
    if (query.periodId) {
      const period = await this.prisma.accountingPeriod.findFirst({
        where: { id: query.periodId, companyId },
      });
      if (!period) throw new NotFoundException('Período contábil não encontrado.');
      return { from: period.startDate, to: period.endDate, period };
    }
    const today = new Date();
    const from = query.from ? startOfDay(query.from) : startOfDay(`${today.getUTCFullYear()}-01-01`);
    const to = query.to ? endOfDay(query.to) : endOfDay(today);
    if (from > to) throw new BadRequestException('A data inicial deve ser anterior à data final.');
    return { from, to, period: null };
  }

  private analytical(rows: AccountMovementRow[]) {
    return rows.filter((row) => row.type === AccountType.ANALITICA);
  }

  // ────────────────────────────────────────────────────────────
  // Balancete de verificação
  // ────────────────────────────────────────────────────────────
  async trialBalance(companyId: string, query: PeriodQueryDto) {
    const { from, to, period } = await this.resolveRange(companyId, query);
    const rows = await this.balances.movements(companyId, { from, to });

    const accounts = this.analytical(rows).filter(
      (row) =>
        !row.openingNet.isZero() ||
        !row.periodDebit.isZero() ||
        !row.periodCredit.isZero() ||
        row.referenceCode,
    );

    let openingDebit = dec(0);
    let openingCredit = dec(0);
    let movementDebit = dec(0);
    let movementCredit = dec(0);
    let closingDebit = dec(0);
    let closingCredit = dec(0);
    let movedAccounts = 0;

    const items = accounts.map((row) => {
      const opening = this.balances.splitBalance(row.openingNet);
      const closing = this.balances.splitBalance(row.closingNet);
      openingDebit = openingDebit.plus(opening.debit);
      openingCredit = openingCredit.plus(opening.credit);
      movementDebit = movementDebit.plus(row.periodDebit);
      movementCredit = movementCredit.plus(row.periodCredit);
      closingDebit = closingDebit.plus(closing.debit);
      closingCredit = closingCredit.plus(closing.credit);
      if (!row.periodDebit.isZero() || !row.periodCredit.isZero()) movedAccounts++;

      return {
        accountId: row.id,
        code: row.code,
        name: row.name,
        classification: row.classification,
        nature: row.nature,
        active: row.active,
        openingDebit: num(opening.debit),
        openingCredit: num(opening.credit),
        movementDebit: num(row.periodDebit),
        movementCredit: num(row.periodCredit),
        closingDebit: num(closing.debit),
        closingCredit: num(closing.credit),
      };
    });

    const difference = closingDebit.minus(closingCredit);
    return {
      from: toISODate(from),
      to: toISODate(to),
      period: period ? { id: period.id, name: period.name, status: period.status } : null,
      rows: items,
      totals: {
        openingDebit: num(openingDebit),
        openingCredit: num(openingCredit),
        movementDebit: num(movementDebit),
        movementCredit: num(movementCredit),
        closingDebit: num(closingDebit),
        closingCredit: num(closingCredit),
      },
      balanced: difference.abs().lessThan(dec('0.01')) && movementDebit.equals(movementCredit),
      difference: num(difference),
      movedAccounts,
      accountCount: items.length,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Balanço Patrimonial
  // ────────────────────────────────────────────────────────────
  async balanceSheet(companyId: string, query: BalanceSheetQueryDto) {
    const date = query.date ? endOfDay(query.date) : endOfDay(new Date());
    const rows = this.analytical(await this.balances.movements(companyId, { to: date }));
    const { resultadoExercicio } = this.balances.statementTotals(rows);

    const groupRows = (group: string) =>
      rows
        .filter((row) => row.statementGroup === group && !row.closingNet.isZero())
        .map((row) => ({
          accountId: row.id,
          code: row.code,
          name: row.name,
          referenceCode: row.referenceCode,
          amount: num(
            group.startsWith('ATIVO') ? row.closingNet : row.closingNet.negated(),
          ),
        }))
        .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));

    const totalOf = (group: string) =>
      groupRows(group).reduce((acc, row) => acc + row.amount, 0);

    const ativoCirculante = groupRows('ATIVO_CIRCULANTE');
    const ativoNaoCirculante = groupRows('ATIVO_NAO_CIRCULANTE');
    const passivoCirculante = groupRows('PASSIVO_CIRCULANTE');
    const passivoNaoCirculante = groupRows('PASSIVO_NAO_CIRCULANTE');
    const patrimonioRows = groupRows('PATRIMONIO_LIQUIDO');

    const totalAtivoCirculante = round2(dec(atualSum(ativoCirculante)));
    const totalAtivoNaoCirculante = round2(dec(atualSum(ativoNaoCirculante)));
    const totalPassivoCirculante = round2(dec(atualSum(passivoCirculante)));
    const totalPassivoNaoCirculante = round2(dec(atualSum(passivoNaoCirculante)));
    const totalPlContas = round2(dec(atualSum(patrimonioRows)));

    const totalAtivo = totalAtivoCirculante.plus(totalAtivoNaoCirculante);
    const totalPassivo = totalPassivoCirculante.plus(totalPassivoNaoCirculante);
    const totalPatrimonio = totalPlContas.plus(round2(resultadoExercicio));
    const totalPassivoPl = totalPassivo.plus(totalPatrimonio);
    const difference = totalAtivo.minus(totalPassivoPl);

    return {
      date: toISODate(date),
      ativo: {
        circulante: { label: GROUP_LABELS.ATIVO_CIRCULANTE, rows: ativoCirculante, total: num(totalAtivoCirculante) },
        naoCirculante: { label: GROUP_LABELS.ATIVO_NAO_CIRCULANTE, rows: ativoNaoCirculante, total: num(totalAtivoNaoCirculante) },
        total: num(totalAtivo),
      },
      passivo: {
        circulante: { label: GROUP_LABELS.PASSIVO_CIRCULANTE, rows: passivoCirculante, total: num(totalPassivoCirculante) },
        naoCirculante: { label: GROUP_LABELS.PASSIVO_NAO_CIRCULANTE, rows: passivoNaoCirculante, total: num(totalPassivoNaoCirculante) },
        total: num(totalPassivo),
      },
      patrimonioLiquido: {
        label: GROUP_LABELS.PATRIMONIO_LIQUIDO,
        rows: patrimonioRows,
        resultadoExercicio: num(resultadoExercicio),
        total: num(totalPatrimonio),
      },
      totalPassivoPl: num(totalPassivoPl),
      balanced: difference.abs().lessThan(dec('0.01')),
      difference: num(difference),
    };
  }

  // ────────────────────────────────────────────────────────────
  // Demonstração do Resultado do Exercício
  // ────────────────────────────────────────────────────────────
  private buildDre(rows: AccountMovementRow[]) {
    const groups = DRE_GROUPS.map((group) => {
      const accounts = rows
        .filter(
          (row) =>
            row.dreGroup === group.key &&
            (!row.periodDebit.isZero() || !row.periodCredit.isZero()),
        )
        .map((row) => ({
          code: row.code,
          name: row.name,
          amount: num(
            group.kind === 'receita'
              ? row.periodCredit.minus(row.periodDebit)
              : row.periodDebit.minus(row.periodCredit),
          ),
        }))
        .sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true }));

      const total = accounts.reduce((acc, account) => acc + account.amount, 0);
      return { ...group, accounts, total: Number(total.toFixed(2)) };
    });

    const get = (key: DreGroup) => groups.find((g) => g.key === key)?.total ?? 0;

    const receitaBruta = get(DreGroup.RECEITA_BRUTA);
    const deducoes = get(DreGroup.DEDUCAO_RECEITA);
    const receitaLiquida = Number((receitaBruta - deducoes).toFixed(2));
    const cmv = get(DreGroup.CMV);
    const lucroBruto = Number((receitaLiquida - cmv).toFixed(2));
    const despesasAdministrativas = get(DreGroup.DESPESA_ADMINISTRATIVA);
    const despesasVendas = get(DreGroup.DESPESA_VENDAS);
    const despesasFinanceiras = get(DreGroup.DESPESA_FINANCEIRA);
    const receitasFinanceiras = get(DreGroup.RECEITA_FINANCEIRA);
    const outrasReceitas = get(DreGroup.OUTRAS_RECEITAS);
    const outrasDespesas = get(DreGroup.OUTRAS_DESPESAS);

    const totalDespesasOperacionais = Number(
      (despesasAdministrativas + despesasVendas).toFixed(2),
    );
    const resultadoAntesTributos = Number(
      (
        lucroBruto -
        totalDespesasOperacionais -
        despesasFinanceiras +
        receitasFinanceiras +
        outrasReceitas -
        outrasDespesas
      ).toFixed(2),
    );
    const tributos = 0;
    const resultadoLiquido = Number((resultadoAntesTributos - tributos).toFixed(2));

    return {
      groups,
      summary: {
        receitaBruta,
        deducoes,
        receitaLiquida,
        cmv,
        lucroBruto,
        despesasAdministrativas,
        despesasVendas,
        totalDespesasOperacionais,
        despesasFinanceiras,
        receitasFinanceiras,
        outrasReceitas,
        outrasDespesas,
        resultadoAntesTributos,
        tributos,
        resultadoLiquido,
        margemLiquida:
          receitaLiquida > 0 ? Number(((resultadoLiquido / receitaLiquida) * 100).toFixed(1)) : 0,
      },
    };
  }

  async dre(companyId: string, query: DreQueryDto) {
    const { from, to, period } = await this.resolveRange(companyId, query);
    const rows = this.analytical(
      await this.balances.movements(companyId, { from, to, excludeClosing: true }),
    );
    const current = this.buildDre(rows);

    let previous: unknown = null;
    if (query.compare) {
      const durationMs = endOfDay(to).getTime() - startOfDay(from).getTime() + 1;
      const prevTo = new Date(startOfDay(from).getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - durationMs + 1);
      const prevRows = this.analytical(
        await this.balances.movements(companyId, {
          from: prevFrom,
          to: prevTo,
          excludeClosing: true,
        }),
      );
      const prev = this.buildDre(prevRows);
      previous = {
        from: toISODate(prevFrom),
        to: toISODate(prevTo),
        groups: prev.groups,
        summary: prev.summary,
      };
    }

    return {
      from: toISODate(from),
      to: toISODate(to),
      period: period ? { id: period.id, name: period.name, status: period.status } : null,
      ...current,
      previous,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Livro Razão
  // ────────────────────────────────────────────────────────────
  async ledger(companyId: string, query: LedgerQueryDto) {
    const account = await this.prisma.account.findFirst({
      where: { id: query.accountId, companyId },
    });
    if (!account) throw new NotFoundException('Conta contábil não encontrada.');

    const { from, to, period } = await this.resolveRange(companyId, query);

    const [openingAgg, lines] = await Promise.all([
      this.prisma.journalEntryLine.aggregate({
        where: {
          accountId: account.id,
          entry: { companyId, date: { lt: startOfDay(from) } },
        },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.journalEntryLine.findMany({
        where: {
          accountId: account.id,
          entry: { companyId, date: { gte: startOfDay(from), lte: endOfDay(to) } },
        },
        include: {
          entry: {
            select: {
              id: true,
              number: true,
              date: true,
              history: true,
              source: true,
              sourceId: true,
              reversalOfId: true,
              reversedBy: { select: { number: true } },
            },
          },
        },
        orderBy: [{ entry: { date: 'asc' } }, { entry: { number: 'asc' } }, { position: 'asc' }],
      }),
    ]);

    const openingNet = dec(openingAgg._sum.debit).minus(dec(openingAgg._sum.credit));
    let balance =
      account.nature === AccountNature.DEVEDORA ? openingNet : openingNet.negated();

    const items = lines.map((line) => {
      balance = account.nature === AccountNature.DEVEDORA
        ? balance.plus(line.debit).minus(line.credit)
        : balance.plus(line.credit).minus(line.debit);
      return {
        id: line.id,
        date: toISODate(line.entry.date),
        entryId: line.entry.id,
        entryNumber: line.entry.number,
        history: line.description || line.entry.history,
        entryHistory: line.entry.history,
        source: line.entry.source,
        reversed: Boolean(line.entry.reversedBy || line.entry.reversalOfId),
        debit: num(line.debit),
        credit: num(line.credit),
        balance: num(balance),
      };
    });

    const totalDebit = lines.reduce((acc, l) => acc.plus(l.debit), dec(0));
    const totalCredit = lines.reduce((acc, l) => acc.plus(l.credit), dec(0));

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        nature: account.nature,
        classification: account.classification,
      },
      from: toISODate(from),
      to: toISODate(to),
      period: period ? { id: period.id, name: period.name, status: period.status } : null,
      openingBalance: num(
        account.nature === AccountNature.DEVEDORA ? openingNet : openingNet.negated(),
      ),
      totalDebit: num(totalDebit),
      totalCredit: num(totalCredit),
      closingBalance: num(balance),
      lines: items,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Dashboard
  // ────────────────────────────────────────────────────────────
  async dashboard(companyId: string, dateParam?: string) {
    const date = dateParam ? endOfDay(dateParam) : endOfDay(new Date());
    const yearStart = startOfDay(`${date.getUTCFullYear()}-01-01`);

    const [bpRows, dreRows] = await Promise.all([
      this.balances.movements(companyId, { to: date }),
      this.balances.movements(companyId, {
        from: yearStart,
        to: date,
        excludeClosing: true,
      }),
    ]);

    const bp = this.analytical(bpRows);
    const dre = this.buildDre(this.analytical(dreRows));
    const totals = this.balances.statementTotals(bp);

    const products = await this.prisma.product.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        name: true,
        category: true,
        quantity: true,
        minimumStock: true,
        averageCost: true,
        unit: true,
      },
    });

    const stockValue = products.reduce(
      (acc, product) => acc.plus(dec(product.quantity).times(dec(product.averageCost))),
      dec(0),
    );
    const stockByCategoryMap = new Map<string, Prisma.Decimal>();
    for (const product of products) {
      const value = dec(product.quantity).times(dec(product.averageCost));
      stockByCategoryMap.set(
        product.category,
        (stockByCategoryMap.get(product.category) ?? dec(0)).plus(value),
      );
    }

    const [assetsCount, lowStock, recentEntries, recentMovements, openPeriod] = await Promise.all([
      this.prisma.asset.count({ where: { companyId, status: { not: 'BAIXADO' } } }),
      products.filter((p) => dec(p.quantity).lessThanOrEqualTo(dec(p.minimumStock))).length,
      this.prisma.journalEntry.findMany({
        where: { companyId },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        take: 8,
        include: {
          lines: { include: { account: { select: { code: true, name: true } } }, take: 2 },
          createdBy: { select: { name: true } },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { companyId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        include: { product: { select: { name: true, unit: true } } },
      }),
      this.prisma.accountingPeriod.findFirst({
        where: {
          companyId,
          startDate: { lte: date },
          endDate: { gte: date },
          status: PeriodStatus.OPEN,
        },
      }),
    ]);

    const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 5, 1));
    const months = monthsBetween(monthStart, date);
    const monthlyLines = await this.prisma.journalEntryLine.findMany({
      where: {
        entry: {
          companyId,
          date: { gte: monthStart, lte: date },
          NOT: { source: JournalSource.ENCERRAMENTO },
        },
        account: {
          classification: {
            in: [
              AccountClassification.RECEITA,
              AccountClassification.CUSTO,
              AccountClassification.DESPESA,
            ],
          },
        },
      },
      select: {
        debit: true,
        credit: true,
        account: { select: { classification: true } },
        entry: { select: { date: true } },
      },
    });

    const monthly = months.map((month) => {
      const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
      let receita = dec(0);
      let despesa = dec(0);
      for (const line of monthlyLines) {
        if (`${line.entry.date.getUTCFullYear()}-${String(line.entry.date.getUTCMonth() + 1).padStart(2, '0')}` !== key) continue;
        if (line.account.classification === AccountClassification.RECEITA) {
          receita = receita.plus(line.credit).minus(line.debit);
        } else {
          despesa = despesa.plus(line.debit).minus(line.credit);
        }
      }
      return {
        month: key,
        label: formatPeriodLabel(month),
        receita: num(receita),
        despesas: num(despesa),
        resultado: num(receita.minus(despesa)),
      };
    });

    const groupTotal = (group: string) =>
      bp
        .filter((row) => row.statementGroup === group)
        .reduce((acc, row) => acc.plus(row.closingNet), dec(0));

    return {
      date: toISODate(date),
      cards: {
        totalAtivo: num(totals.ativo),
        totalPassivo: num(totals.passivo),
        patrimonioLiquido: num(totals.patrimonioLiquido),
        receitaTotal: dre.summary.receitaLiquida,
        despesasTotais: Number(
          (
            dre.summary.cmv +
            dre.summary.totalDespesasOperacionais +
            dre.summary.despesasFinanceiras +
            dre.summary.outrasDespesas
          ).toFixed(2),
        ),
        resultadoExercicio: dre.summary.resultadoLiquido,
        estoqueValor: num(stockValue),
        ativosCount: assetsCount,
      },
      dre: dre.summary,
      monthly,
      composition: {
        ativoCirculante: num(groupTotal('ATIVO_CIRCULANTE')),
        ativoNaoCirculante: num(groupTotal('ATIVO_NAO_CIRCULANTE')),
        passivoCirculante: num(groupTotal('PASSIVO_CIRCULANTE')),
        passivoNaoCirculante: num(groupTotal('PASSIVO_NAO_CIRCULANTE')),
        patrimonioLiquido: num(totals.patrimonioLiquido),
      },
      stock: {
        totalValue: num(stockValue),
        productCount: products.length,
        lowStock,
        byCategory: [...stockByCategoryMap.entries()]
          .map(([category, value]) => ({ category, value: num(value) }))
          .sort((a, b) => b.value - a.value),
      },
      recentEntries,
      recentMovements,
      openPeriod: openPeriod
        ? { id: openPeriod.id, name: openPeriod.name, startDate: openPeriod.startDate, endDate: openPeriod.endDate }
        : null,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Encerramento do exercício
  // ────────────────────────────────────────────────────────────
  private async buildClosing(
    client: Prisma.TransactionClient,
    companyId: string,
    period: { id: string; name: string; startDate: Date; endDate: Date },
  ) {
    const resultAccounts = await client.account.findMany({
      where: {
        companyId,
        type: AccountType.ANALITICA,
        classification: {
          in: [
            AccountClassification.RECEITA,
            AccountClassification.CUSTO,
            AccountClassification.DESPESA,
          ],
        },
      },
    });

    const grouped = await client.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: resultAccounts.map((a) => a.id) },
        entry: {
          companyId,
          date: { gte: period.startDate, lte: period.endDate },
        },
      },
      _sum: { debit: true, credit: true },
    });

    const movementByAccount = new Map(
      grouped.map((g) => [g.accountId, dec(g._sum.debit).minus(dec(g._sum.credit))]),
    );

    const lines: { accountId: string; code: string; name: string; debit: number; credit: number }[] = [];
    let totalDebit = dec(0);
    let totalCredit = dec(0);

    for (const account of resultAccounts) {
      const net = movementByAccount.get(account.id);
      if (!net || net.isZero()) continue;
      if (net.greaterThan(0)) {
        lines.push({
          accountId: account.id,
          code: account.code,
          name: account.name,
          debit: 0,
          credit: num(net),
        });
        totalCredit = totalCredit.plus(net);
      } else {
        lines.push({
          accountId: account.id,
          code: account.code,
          name: account.name,
          debit: num(net.negated()),
          credit: 0,
        });
        totalDebit = totalDebit.plus(net.negated());
      }
    }

    const result = totalDebit.minus(totalCredit);
    const resultAccount = await client.account.findFirst({
      where: { companyId, referenceCode: 'RESULTADO_EXERCICIO' },
    });
    if (!resultAccount && (lines.length > 0 || !result.isZero())) {
      throw new BadRequestException(
        'A conta de referência RESULTADO_EXERCICIO não está configurada no plano de contas.',
      );
    }

    if (resultAccount && !result.isZero()) {
      if (result.greaterThan(0)) {
        lines.push({
          accountId: resultAccount.id,
          code: resultAccount.code,
          name: resultAccount.name,
          debit: 0,
          credit: num(result),
        });
        totalCredit = totalCredit.plus(result);
      } else {
        lines.push({
          accountId: resultAccount.id,
          code: resultAccount.code,
          name: resultAccount.name,
          debit: num(result.negated()),
          credit: 0,
        });
        totalDebit = totalDebit.plus(result.negated());
      }
    }

    const transferLines: { accountId: string; code: string; name: string; debit: number; credit: number }[] = [];
    if (resultAccount && !result.isZero()) {
      const targetRef = result.greaterThan(0) ? 'LUCROS_ACUMULADOS' : 'PREJUIZOS_ACUMULADOS';
      const target = await client.account.findFirst({
        where: { companyId, referenceCode: targetRef },
      });
      if (!target) {
        throw new BadRequestException(
          `A conta de referência ${targetRef} não está configurada no plano de contas.`,
        );
      }
      if (result.greaterThan(0)) {
        transferLines.push(
          { accountId: resultAccount.id, code: resultAccount.code, name: resultAccount.name, debit: num(result), credit: 0 },
          { accountId: target.id, code: target.code, name: target.name, debit: 0, credit: num(result) },
        );
      } else {
        const loss = result.negated();
        transferLines.push(
          { accountId: resultAccount.id, code: resultAccount.code, name: resultAccount.name, debit: 0, credit: num(loss) },
          { accountId: target.id, code: target.code, name: target.name, debit: num(loss), credit: 0 },
        );
      }
    }

    return {
      period: {
        id: period.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
      },
      closing: {
        lines,
        totalDebit: num(totalDebit),
        totalCredit: num(totalCredit),
        result: num(result),
      },
      transfer: {
        lines: transferLines,
        total: num(result.abs()),
      },
      result: num(result),
      resultAccountId: resultAccount?.id ?? null,
    };
  }

  async closingPreview(companyId: string, periodId: string) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id: periodId, companyId },
    });
    if (!period) throw new NotFoundException('Período contábil não encontrado.');

    if (period.status === PeriodStatus.CLOSED) {
      return {
        alreadyClosed: true,
        period: {
          id: period.id,
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          status: period.status,
        },
        closing: { lines: [], totalDebit: 0, totalCredit: 0, result: 0 },
        transfer: { lines: [], total: 0 },
        result: 0,
      };
    }

    const preview = await this.buildClosing(
      this.prisma as unknown as Prisma.TransactionClient,
      companyId,
      period,
    );
    return { alreadyClosed: false, ...preview };
  }

  async closePeriod(companyId: string, userId: string, dto: ClosingDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const period = await tx.accountingPeriod.findFirst({
          where: { id: dto.periodId, companyId },
        });
        if (!period) throw new NotFoundException('Período contábil não encontrado.');
        if (period.status === PeriodStatus.CLOSED) {
          throw new BadRequestException(`O período "${period.name}" já está encerrado.`);
        }

        const preview = await this.buildClosing(tx, companyId, period);
        const closingDate = dto.date ? startOfDay(dto.date) : startOfDay(period.endDate);

        let closingEntry: unknown = null;
        let transferEntry: unknown = null;

        if (preview.closing.lines.length > 0) {
          closingEntry = await this.journal.postEntry(tx, {
            companyId,
            date: closingDate,
            history: `Encerramento das contas de resultado — ${period.name}`,
            source: JournalSource.ENCERRAMENTO,
            sourceId: period.id,
            createdById: userId,
            periodId: period.id,
            lines: preview.closing.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: 'Encerramento do exercício',
            })) as PostingLine[],
          });
        }

        if (preview.transfer.lines.length > 0) {
          transferEntry = await this.journal.postEntry(tx, {
            companyId,
            date: closingDate,
            history: `Transferência do resultado do exercício — ${period.name}`,
            source: JournalSource.ENCERRAMENTO,
            sourceId: period.id,
            createdById: userId,
            periodId: period.id,
            lines: preview.transfer.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: 'Transferência do resultado para o patrimônio líquido',
            })) as PostingLine[],
          });
        }

        await tx.accountingPeriod.update({
          where: { id: period.id },
          data: { status: PeriodStatus.CLOSED, closedAt: new Date(), closedById: userId },
        });

        await this.audit.log(
          {
            companyId,
            userId,
            action: 'CLOSE_PERIOD',
            entity: 'AccountingPeriod',
            entityId: period.id,
            description: `Período "${period.name}" encerrado com resultado de ${preview.result.toFixed(2)}.`,
            metadata: preview as unknown as Record<string, unknown>,
          },
          tx,
        );

        return {
          message: `Período "${period.name}" encerrado com sucesso.`,
          result: preview.result,
          closingEntry,
          transferEntry,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );
  }
}

function atualSum(rows: { amount: number }[]) {
  return rows.reduce((acc, row) => acc + row.amount, 0);
}
