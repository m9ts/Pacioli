import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DepreciationStatus, JournalSource, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JournalService, PostingLine } from '../journal/journal.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { dec, money } from '../common/utils/decimal';
import { DepreciateDto } from './dto/asset.dto';

type AssetFull = Prisma.AssetGetPayload<{}>;

/** Depreciação pelo método linear, integrada à escrituração. */
@Injectable()
export class DepreciationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  monthlyAmount(asset: AssetFull): Prisma.Decimal {
    const base = dec(asset.acquisitionValue).minus(dec(asset.residualValue));
    return money(base.div(asset.usefulLifeMonths));
  }

  /** Tabela de depreciação (prevista e contabilizada) de um ativo. */
  schedule(asset: AssetFull) {
    const monthly = this.monthlyAmount(asset);
    const base = dec(asset.acquisitionValue).minus(dec(asset.residualValue));
    const start = new Date(asset.acquisitionDate);
    const startMonth = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
    const disposal = asset.disposalDate
      ? Date.UTC(asset.disposalDate.getUTCFullYear(), asset.disposalDate.getUTCMonth(), 1)
      : null;

    const rows = [] as {
      year: number;
      month: number;
      date: string;
      openingValue: number;
      depreciation: number;
      accumulated: number;
      bookValue: number;
      status: DepreciationStatus;
    }[];

    let accumulated = dec(0);
    let openAccumulated = dec(0);
    let booked = dec(0);

    for (let index = 0; index < asset.usefulLifeMonths; index++) {
      const date = new Date(startMonth);
      date.setUTCMonth(date.getUTCMonth() + index);
      if (disposal && date.getTime() > disposal) break;

      const remaining = base.minus(booked);
      const amount = monthly.lessThan(remaining) ? monthly : remaining;
      const nextAccumulated = openAccumulated.plus(amount);

      rows.push({
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        date: date.toISOString().slice(0, 10),
        openingValue: Number(dec(asset.acquisitionValue).minus(accumulated).toFixed(2)),
        depreciation: Number(amount.toFixed(2)),
        accumulated: Number(nextAccumulated.toFixed(2)),
        bookValue: Number(dec(asset.acquisitionValue).minus(nextAccumulated).toFixed(2)),
        status: DepreciationStatus.PREVISTO,
      });

      openAccumulated = nextAccumulated;
      accumulated = accumulated.plus(amount);
    }

    return { monthly: Number(monthly.toFixed(2)), depreciableBase: Number(base.toFixed(2)), rows };
  }

  async findOne(companyId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) throw new NotFoundException('Ativo não encontrado.');
    return asset;
  }

  /** Prévia da depreciação do mês: quais ativos podem ser depreciados e valores. */
  async monthPreview(companyId: string, dto: DepreciateDto) {
    const assets = await this.prisma.asset.findMany({
      where: {
        companyId,
        status: 'ATIVO',
        ...(dto.assetId ? { id: dto.assetId } : {}),
      },
      include: {
        records: { where: { referenceYear: dto.year, referenceMonth: dto.month } },
      },
      orderBy: { code: 'asc' },
    });

    const rows = assets.map((asset) => {
      const monthly = this.monthlyAmount(asset);
      const base = dec(asset.acquisitionValue).minus(dec(asset.residualValue));
      const remaining = base.minus(dec(asset.accumulatedDepreciation));
      const amount = monthly.lessThan(remaining) ? monthly : remaining;
      const start = new Date(asset.acquisitionDate);
      const startDate = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
      const targetDate = Date.UTC(dto.year, dto.month - 1, 1);
      const inWindow = targetDate >= startDate && !amount.lessThanOrEqualTo(0);

      return {
        assetId: asset.id,
        code: asset.code,
        name: asset.name,
        category: asset.category,
        alreadyPosted: asset.records.length > 0,
        eligible: inWindow && asset.records.length === 0,
        amount: Number(amount.lessThan(0) ? 0 : amount.toFixed(2)),
        remaining: Number(remaining.lessThan(0) ? 0 : remaining.toFixed(2)),
      };
    });

    const total = rows.reduce((acc, row) => acc + (row.eligible ? row.amount : 0), 0);
    return {
      year: dto.year,
      month: dto.month,
      rows,
      total: Number(total.toFixed(2)),
      eligibleCount: rows.filter((row) => row.eligible).length,
    };
  }

  /** Contabiliza a depreciação de um mês para todos os ativos elegíveis. */
  async postMonth(companyId: string, user: AuthUser, dto: DepreciateDto) {
    const preview = await this.monthPreview(companyId, dto);
    const eligible = preview.rows.filter((row) => row.eligible && row.amount > 0);

    if (eligible.length === 0) {
      throw new BadRequestException(
        'Nenhum ativo elegível para depreciação neste mês. Verifique a data de aquisição, a vida útil e os lançamentos já contabilizados.',
      );
    }

    const date = new Date(Date.UTC(dto.year, dto.month - 1, 1));

    return this.prisma.$transaction(
      async (tx) => {
        const expenseAccount = await this.journal.accountByRef(
          tx,
          companyId,
          'DESPESA_DEPRECIACAO',
          'contabilizar a depreciação',
        );
        const accumulatedAccount = await this.journal.accountByRef(
          tx,
          companyId,
          'DEPRECIACAO_ACUMULADA',
          'contabilizar a depreciação',
        );

        const results = [] as { assetId: string; code: string; amount: number; entryId: string }[];

        for (const row of eligible) {
          const asset = await tx.asset.findFirst({
            where: { id: row.assetId, companyId },
          });
          if (!asset) continue;

          const entry = await this.journal.postEntry(tx, {
            companyId,
            date,
            history: `Depreciação mensal de ${asset.name} (${asset.code}) — ${String(dto.month).padStart(2, '0')}/${dto.year}`,
            source: JournalSource.DEPRECIACAO,
            sourceId: asset.id,
            createdById: user.id,
            lines: [
              {
                accountId: asset.depreciationExpenseAccountId ?? expenseAccount.id,
                debit: money(row.amount),
                description: 'Despesa com depreciação',
              } as PostingLine,
              {
                accountId: asset.depreciationAccountId ?? accumulatedAccount.id,
                credit: money(row.amount),
                description: 'Depreciação acumulada',
              } as PostingLine,
            ],
          });

          const newAccumulated = dec(asset.accumulatedDepreciation).plus(money(row.amount));
          const base = dec(asset.acquisitionValue).minus(dec(asset.residualValue));
          if (newAccumulated.greaterThan(base)) {
            throw new BadRequestException(
              `Ativo ${asset.code} — ${asset.name} já atingiu o valor depreciável.`,
            );
          }

          await tx.asset.update({
            where: { id: asset.id },
            data: { accumulatedDepreciation: newAccumulated },
          });

          await tx.depreciationRecord.create({
            data: {
              companyId,
              assetId: asset.id,
              referenceYear: dto.year,
              referenceMonth: dto.month,
              date,
              openingValue: dec(asset.acquisitionValue),
              depreciationAmount: money(row.amount),
              accumulatedDepreciation: newAccumulated,
              bookValue: dec(asset.acquisitionValue).minus(newAccumulated),
              status: DepreciationStatus.CONTABILIZADO,
              journalEntryId: entry.id,
            },
          });

          results.push({ assetId: asset.id, code: asset.code, amount: row.amount, entryId: entry.id });
        }

        await this.audit.log(
          {
            companyId,
            userId: user.id,
            action: 'DEPRECIATION',
            entity: 'Asset',
            description: `Depreciação de ${String(dto.month).padStart(2, '0')}/${dto.year} contabilizada para ${results.length} ativos.`,
            metadata: { year: dto.year, month: dto.month, assets: results.length },
          },
          tx,
        );

        return {
          message: `Depreciação contabilizada para ${results.length} ativo(s).`,
          total: preview.total,
          results,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
    );
  }

  /** Estorna uma depreciação contabilizada. */
  async reverseRecord(companyId: string, user: AuthUser, recordId: string, reason: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const record = await tx.depreciationRecord.findFirst({
          where: { id: recordId, companyId },
          include: { asset: true },
        });
        if (!record) throw new NotFoundException('Registro de depreciação não encontrado.');
        if (record.status !== DepreciationStatus.CONTABILIZADO) {
          throw new BadRequestException('Somente depreciações contabilizadas podem ser estornadas.');
        }
        if (!record.journalEntryId) {
          throw new BadRequestException('Registro sem lançamento contábil vinculado.');
        }

        await this.journal.reverseInTransaction(tx, companyId, user.id, record.journalEntryId, reason);

        await tx.asset.update({
          where: { id: record.assetId },
          data: {
            accumulatedDepreciation: dec(record.asset.accumulatedDepreciation).minus(
              record.depreciationAmount,
            ),
          },
        });

        await tx.depreciationRecord.update({
          where: { id: record.id },
          data: { status: DepreciationStatus.ESTORNADO },
        });

        await this.audit.log(
          {
            companyId,
            userId: user.id,
            action: 'REVERSE',
            entity: 'DepreciationRecord',
            entityId: record.id,
            description: `Depreciação de ${record.asset.code} em ${String(record.referenceMonth).padStart(2, '0')}/${record.referenceYear} estornada.`,
            metadata: { reason },
          },
          tx,
        );

        return { message: 'Depreciação estornada com sucesso.' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** Histórico de depreciação contabilizada de um ativo. */
  history(companyId: string, assetId: string) {
    return this.prisma.depreciationRecord.findMany({
      where: { companyId, assetId },
      orderBy: [{ referenceYear: 'desc' }, { referenceMonth: 'desc' }],
    });
  }
}
