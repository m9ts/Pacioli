import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Account,
  AccountType,
  JournalEntry,
  JournalSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { dec, money } from '../common/utils/decimal';
import { endOfDay, startOfDay, toISODate } from '../common/utils/date';
import { AuditService } from '../audit/audit.service';
import { CreateJournalEntryDto, ListJournalDto } from './dto/journal.dto';

export interface PostingLine {
  accountId?: string;
  accountRef?: string;
  debit?: Prisma.Decimal | number | string;
  credit?: Prisma.Decimal | number | string;
  description?: string;
}

export interface PostEntryInput {
  companyId: string;
  date: Date;
  history: string;
  source?: JournalSource;
  sourceId?: string;
  createdById?: string;
  lines: PostingLine[];
  periodId?: string;
  /** Preenchido quando o lançamento é um estorno de outro. */
  reversalOfId?: string;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Núcleo da escrituração: valida partidas dobradas, período aberto e contas
   * analíticas, e grava o lançamento dentro da transação recebida.
   */
  async postEntry(tx: Prisma.TransactionClient, input: PostEntryInput): Promise<JournalEntry> {
    if (!input.lines || input.lines.length < 2) {
      throw new BadRequestException('Um lançamento precisa de pelo menos duas linhas.');
    }

    const accountIds = [...new Set(input.lines.filter((l) => l.accountId).map((l) => l.accountId!))];
    const refs = [...new Set(input.lines.filter((l) => l.accountRef).map((l) => l.accountRef!))];

    const [byId, byRef] = await Promise.all([
      accountIds.length
        ? tx.account.findMany({ where: { id: { in: accountIds }, companyId: input.companyId } })
        : Promise.resolve([] as Account[]),
      refs.length
        ? tx.account.findMany({ where: { companyId: input.companyId, referenceCode: { in: refs } } })
        : Promise.resolve([] as Account[]),
    ]);

    const accountMap = new Map<string, Account>();
    byId.forEach((a) => accountMap.set(a.id, a));
    byRef.forEach((a) => accountMap.set(a.referenceCode!, a));

    const normalized = input.lines.map((line, index) => {
      const account = line.accountId
        ? accountMap.get(line.accountId)
        : line.accountRef
          ? accountMap.get(line.accountRef)
          : undefined;
      if (!account) {
        throw new BadRequestException(
          line.accountRef
            ? `A conta de referência ${line.accountRef} não está configurada no plano de contas da empresa.`
            : `Conta contábil inválida na linha ${index + 1}.`,
        );
      }
      if (account.type !== AccountType.ANALITICA) {
        throw new BadRequestException(
          `A conta ${account.code} — ${account.name} é sintética e não pode receber lançamentos.`,
        );
      }
      if (!account.active) {
        throw new BadRequestException(`A conta ${account.code} — ${account.name} está inativa.`);
      }

      const debit = money(line.debit ?? 0);
      const credit = money(line.credit ?? 0);
      if (debit.isNegative() || credit.isNegative()) {
        throw new BadRequestException('Débitos e créditos não podem ser negativos.');
      }
      if ((debit.isZero() && credit.isZero()) || (!debit.isZero() && !credit.isZero())) {
        throw new BadRequestException(
          `A linha ${index + 1} deve conter débito OU crédito com valor maior que zero.`,
        );
      }

      return {
        accountId: account.id,
        account,
        debit,
        credit,
        description: line.description,
        position: index,
      };
    });

    const totalDebit = normalized.reduce((acc, l) => acc.plus(l.debit), dec(0));
    const totalCredit = normalized.reduce((acc, l) => acc.plus(l.credit), dec(0));

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Partidas dobradas desequilibradas: débitos ${totalDebit.toFixed(2)} e créditos ${totalCredit.toFixed(2)}. ` +
          'A diferença deve ser zero para confirmar o lançamento.',
      );
    }
    if (totalDebit.isZero()) {
      throw new BadRequestException('O lançamento não pode ter valor total zero.');
    }

    const date = startOfDay(input.date);
    const period = await this.resolvePeriod(tx, input.companyId, date, input.periodId);

    const aggregate = await tx.journalEntry.aggregate({
      where: { companyId: input.companyId },
      _max: { number: true },
    });
    const number = (aggregate._max.number ?? 0) + 1;

    return tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        periodId: period.id,
        number,
        date,
        history: input.history.trim(),
        source: input.source ?? JournalSource.MANUAL,
        sourceId: input.sourceId,
        createdById: input.createdById,
        reversalOfId: input.reversalOfId,
        totalDebit,
        totalCredit,
        lines: {
          create: normalized.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description,
            position: line.position,
          })),
        },
      },
      include: { lines: { include: { account: true } }, period: true },
    });
  }

  private async resolvePeriod(
    tx: Prisma.TransactionClient,
    companyId: string,
    date: Date,
    periodId?: string,
  ) {
    if (periodId) {
      const period = await tx.accountingPeriod.findFirst({ where: { id: periodId, companyId } });
      if (!period) throw new NotFoundException('Período contábil não encontrado.');
      if (period.status === 'CLOSED') {
        throw new ForbiddenException(
          `O período "${period.name}" está encerrado e não aceita novos lançamentos.`,
        );
      }
      if (date < period.startDate || date > period.endDate) {
        throw new BadRequestException('A data do lançamento está fora do período contábil selecionado.');
      }
      return period;
    }

    const periods = await tx.accountingPeriod.findMany({ where: { companyId } });
    const covering = periods.find((p) => date >= p.startDate && date <= p.endDate);
    if (!covering) {
      throw new BadRequestException(
        `Não há período contábil aberto que cubra ${toISODate(date)}. Configure o período contábil antes de lançar.`,
      );
    }
    if (covering.status === 'CLOSED') {
      throw new ForbiddenException(
        `O período "${covering.name}" está encerrado. Reabra o período ou escolha outra data.`,
      );
    }
    return covering;
  }

  /** Busca conta analítica por código de referência, com mensagem orientativa. */
  async accountByRef(
    tx: Prisma.TransactionClient,
    companyId: string,
    reference: string,
    purpose: string,
  ): Promise<Account> {
    const account = await tx.account.findFirst({
      where: { companyId, referenceCode: reference },
    });
    if (!account) {
      throw new BadRequestException(
        `Não foi possível ${purpose}: a conta de referência ${reference} não está configurada no plano de contas. ` +
          'Acesse "Plano de contas" e vincule a conta adequada.',
      );
    }
    return account;
  }

  async paymentAccount(
    tx: Prisma.TransactionClient,
    companyId: string,
    method: 'DINHEIRO' | 'BANCO' | 'A_PRAZO',
    purpose: string,
  ) {
    if (method === 'A_PRAZO') return null;
    return this.accountByRef(tx, companyId, method === 'DINHEIRO' ? 'CAIXA' : 'BANCO', purpose);
  }

  async createManual(companyId: string, userId: string, dto: CreateJournalEntryDto) {
    const entry = await this.prisma.$transaction(
      async (tx) => {
        const created = await this.postEntry(tx, {
          companyId,
          date: new Date(dto.date),
          history: dto.history,
          source: JournalSource.MANUAL,
          createdById: userId,
          lines: dto.lines,
        });
        await this.audit.log(
          {
            companyId,
            userId,
            action: 'CREATE',
            entity: 'JournalEntry',
            entityId: created.id,
            description: `Lançamento manual nº ${created.number} registrado.`,
          },
          tx,
        );
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return entry;
  }

  async list(companyId: string, query: ListJournalDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.JournalEntryWhereInput = {
      companyId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: startOfDay(query.from) } : {}),
              ...(query.to ? { lte: endOfDay(query.to) } : {}),
            },
          }
        : {}),
      ...(query.number ? { number: query.number } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.accountId ? { lines: { some: { accountId: query.accountId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { history: { contains: query.search, mode: 'insensitive' } },
              { sourceId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, totals] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: {
          lines: { include: { account: { select: { id: true, code: true, name: true } } } },
          createdBy: { select: { id: true, name: true } },
          reversedBy: { select: { id: true, number: true } },
          reversalOf: { select: { id: true, number: true } },
        },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.journalEntry.count({ where }),
      this.prisma.journalEntry.aggregate({
        where,
        _sum: { totalDebit: true, totalCredit: true },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      sumDebit: Number(totals._sum.totalDebit ?? 0),
      sumCredit: Number(totals._sum.totalCredit ?? 0),
    };
  }

  async findOne(companyId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId },
      include: {
        lines: { include: { account: true } },
        createdBy: { select: { id: true, name: true } },
        period: true,
        reversedBy: { select: { id: true, number: true, date: true } },
        reversalOf: { select: { id: true, number: true, date: true } },
      },
    });
    if (!entry) throw new NotFoundException('Lançamento não encontrado.');
    return entry;
  }

  /** Estorna um lançamento criando outro com débitos e créditos invertidos. */
  async reverse(companyId: string, userId: string, id: string, reason: string, date?: string) {
    return this.prisma.$transaction(
      (tx) => this.reverseInTransaction(tx, companyId, userId, id, reason, date),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Núcleo do estorno; recebe a transação para compor operações maiores. */
  async reverseInTransaction(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    id: string,
    reason: string,
    date?: string,
  ) {
    {
        const entry = await tx.journalEntry.findFirst({
          where: { id, companyId },
          include: {
            lines: { include: { account: true } },
            reversedBy: true,
            reversalOf: true,
          },
        });
        if (!entry) throw new NotFoundException('Lançamento não encontrado.');
        if (entry.reversedBy) {
          throw new BadRequestException(
            `Este lançamento já foi estornado pelo lançamento nº ${entry.reversedBy.number}.`,
          );
        }
        if (entry.reversalOfId) {
          throw new BadRequestException('Um lançamento de estorno não pode ser estornado.');
        }

        const reversalDate = date ? startOfDay(date) : startOfDay(new Date());
        const created = await this.postEntry(tx, {
          companyId,
          date: reversalDate,
          history: `Estorno do lançamento nº ${entry.number} — ${reason}`.slice(0, 300),
          source: JournalSource.ESTORNO,
          sourceId: entry.id,
          reversalOfId: entry.id,
          createdById: userId,
          lines: entry.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.credit,
            credit: line.debit,
            description: `Estorno: ${line.description ?? entry.history}`.slice(0, 200),
          })),
        });

        await tx.journalEntry.update({
          where: { id: entry.id },
          data: { reverseReason: reason },
        });

        await this.audit.log(
          {
            companyId,
            userId,
            action: 'REVERSE',
            entity: 'JournalEntry',
            entityId: entry.id,
            description: `Lançamento nº ${entry.number} estornado pelo nº ${created.number}.`,
            metadata: { reason, reversalEntryId: created.id },
          },
          tx,
        );

        return { message: 'Estorno registrado com sucesso.', entry: created };
      }
  }

  /** Exclusão nunca é permitida: preserva a integridade do Livro Diário. */
  async remove() {
    throw new BadRequestException(
      'Lançamentos contabilizados não podem ser excluídos. Utilize o estorno para corrigir a escrituração.',
    );
  }
}
