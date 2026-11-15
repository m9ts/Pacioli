import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AcquisitionMethod,
  AssetCategory,
  AccountType,
  DepreciationMethod,
  JournalSource,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { DepreciationService } from './depreciation.service';
import { AuditService } from '../audit/audit.service';
import type { PostingLine } from '../journal/journal.service';
import { AuthUser } from '../common/decorators';
import { dec, money } from '../common/utils/decimal';
import { startOfDay } from '../common/utils/date';
import { ASSET_CATEGORY_ACCOUNT } from '../accounts/default-chart';
import {
  CreateAssetDto,
  DisposeAssetDto,
  TransferAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  MOVEIS_UTENSILIOS: 'Móveis e Utensílios',
  MAQUINAS_EQUIPAMENTOS: 'Máquinas e Equipamentos',
  VEICULOS: 'Veículos',
  INFORMATICA: 'Equipamentos de Informática',
  IMOVEIS: 'Imóveis',
  OUTROS: 'Outros Bens',
};

const ACQUISITION_CREDIT_REF: Record<AcquisitionMethod, string | null> = {
  [AcquisitionMethod.A_VISTA]: null, // resolve por forma de pagamento
  [AcquisitionMethod.A_PRAZO]: 'FORNECEDORES',
  [AcquisitionMethod.FINANCIAMENTO]: 'EMPRESTIMOS_LP',
  [AcquisitionMethod.INTEGRALIZACAO_CAPITAL]: 'CAPITAL_SOCIAL',
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly depreciation: DepreciationService,
    private readonly audit: AuditService,
  ) {}

  async resolveAssetAccount(
    tx: Prisma.TransactionClient,
    companyId: string,
    categoryId: AssetCategory,
    assetAccountId?: string,
  ) {
    if (assetAccountId) {
      const account = await tx.account.findFirst({
        where: { id: assetAccountId, companyId },
      });
      if (!account) throw new NotFoundException('Conta contábil do ativo não encontrada.');
      if (account.type !== AccountType.ANALITICA || !account.active) {
        throw new BadRequestException('A conta do imobilizado deve ser analítica e ativa.');
      }
      return account;
    }
    const reference = ASSET_CATEGORY_ACCOUNT[categoryId];
    if (!reference) {
      throw new BadRequestException('Categoria de ativo sem conta padrão configurada.');
    }
    return this.journal.accountByRef(tx, companyId, reference, 'registrar a aquisição do ativo');
  }

  async create(companyId: string, user: AuthUser, dto: CreateAssetDto) {
    const exists = await this.prisma.asset.findFirst({ where: { companyId, code: dto.code } });
    if (exists) throw new BadRequestException(`Já existe um ativo com o código ${dto.code}.`);
    if (dto.usefulLifeMonths < 1) {
      throw new BadRequestException('Informe a vida útil em meses.');
    }
    const residual = money(dto.residualValue ?? 0);
    const value = money(dto.acquisitionValue);
    if (residual.greaterThanOrEqualTo(value)) {
      throw new BadRequestException('O valor residual deve ser menor que o valor de aquisição.');
    }
    if (dto.depreciationMethod && dto.depreciationMethod !== DepreciationMethod.LINEAR) {
      throw new BadRequestException('Atualmente apenas o método linear é suportado.');
    }

    const paymentMethod = dto.paymentMethod ?? PaymentMethod.DINHEIRO;

    const asset = await this.prisma.$transaction(
      async (tx) => {
        const assetAccount = await this.resolveAssetAccount(
          tx,
          companyId,
          dto.category,
          dto.assetAccountId,
        );

        const depreciationAccount = await tx.account.findFirst({
          where: { companyId, referenceCode: 'DEPRECIACAO_ACUMULADA' },
        });
        const expenseAccount = await tx.account.findFirst({
          where: { companyId, referenceCode: 'DESPESA_DEPRECIACAO' },
        });
        if (!depreciationAccount || !expenseAccount) {
          throw new BadRequestException(
            'Contas de depreciação não configuradas no plano de contas da empresa.',
          );
        }

        const created = await tx.asset.create({
          data: {
            companyId,
            code: dto.code.trim(),
            name: dto.name.trim(),
            category: dto.category,
            description: dto.description,
            acquisitionDate: startOfDay(dto.acquisitionDate),
            acquisitionValue: value,
            supplierId: dto.supplierId,
            supplierName: dto.supplierName,
            location: dto.location,
            assetAccountId: assetAccount.id,
            depreciationAccountId: depreciationAccount.id,
            depreciationExpenseAccountId: expenseAccount.id,
            acquisitionMethod: dto.acquisitionMethod,
            usefulLifeMonths: dto.usefulLifeMonths,
            residualValue: residual,
            depreciationMethod: DepreciationMethod.LINEAR,
          },
        });

        const creditRef =
          dto.acquisitionMethod === AcquisitionMethod.A_VISTA
            ? paymentMethod === PaymentMethod.DINHEIRO
              ? 'CAIXA'
              : 'BANCO'
            : ACQUISITION_CREDIT_REF[dto.acquisitionMethod];

        if (!creditRef) {
          throw new BadRequestException('Forma de aquisição sem contrapartida configurada.');
        }

        const entry = await this.journal.postEntry(tx, {
          companyId,
          date: startOfDay(dto.acquisitionDate),
          history: `Aquisição de ativo: ${created.name} (${created.code})`,
          source: JournalSource.AQUISICAO_ATIVO,
          sourceId: created.id,
          createdById: user.id,
          lines: [
            {
              accountId: assetAccount.id,
              debit: value,
              description: `${CATEGORY_LABELS[created.category]} — ${created.name}`,
            },
            { accountRef: creditRef, credit: value, description: 'Contrapartida da aquisição' },
          ],
        });

        await tx.asset.update({
          where: { id: created.id },
          data: { journalEntryId: entry.id },
        });

        await this.audit.log(
          {
            companyId,
            userId: user.id,
            action: 'CREATE',
            entity: 'Asset',
            entityId: created.id,
            description: `Ativo ${created.code} — ${created.name} adquirido por ${value.toFixed(2)}.`,
          },
          tx,
        );

        return tx.asset.findUnique({
          where: { id: created.id },
          include: { assetAccount: { select: { code: true, name: true } }, supplier: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );

    return asset;
  }

  async list(companyId: string, query: { search?: string; status?: string; category?: string }) {
    const assets = await this.prisma.asset.findMany({
      where: {
        companyId,
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.category ? { category: query.category as AssetCategory } : {}),
        ...(query.search
          ? {
              OR: [
                { code: { contains: query.search, mode: 'insensitive' } },
                { name: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        assetAccount: { select: { code: true, name: true } },
        supplier: { select: { id: true, name: true } },
        records: { where: { status: 'CONTABILIZADO' }, select: { depreciationAmount: true } },
      },
      orderBy: { code: 'asc' },
    });

    let totalCost = dec(0);
    let totalDepreciation = dec(0);
    let totalBook = dec(0);

    const rows = assets.map((asset) => {
      const cost = dec(asset.acquisitionValue);
      const accumulated = dec(asset.records.reduce((acc, r) => acc.plus(r.depreciationAmount), dec(0)));
      const book = cost.minus(accumulated);
      totalCost = totalCost.plus(cost);
      totalDepreciation = totalDepreciation.plus(accumulated);
      totalBook = totalBook.plus(book);

      return {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        category: asset.category,
        categoryLabel: CATEGORY_LABELS[asset.category],
        acquisitionDate: asset.acquisitionDate,
        acquisitionValue: Number(cost.toFixed(2)),
        usefulLifeMonths: asset.usefulLifeMonths,
        residualValue: Number(dec(asset.residualValue).toFixed(2)),
        accumulatedDepreciation: Number(accumulated.toFixed(2)),
        bookValue: Number(book.toFixed(2)),
        status: asset.status,
        location: asset.location,
        supplierName: asset.supplierName ?? asset.supplier?.name ?? null,
        assetAccount: asset.assetAccount,
        monthlyDepreciation: Number(this.depreciation.monthlyAmount(asset).toFixed(2)),
      };
    });

    return {
      rows,
      totals: {
        cost: Number(totalCost.toFixed(2)),
        accumulatedDepreciation: Number(totalDepreciation.toFixed(2)),
        bookValue: Number(totalBook.toFixed(2)),
        count: rows.length,
      },
      categories: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
    };
  }

  async findOne(companyId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId },
      include: {
        assetAccount: { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, name: true } },
        records: { orderBy: [{ referenceYear: 'desc' }, { referenceMonth: 'desc' }] },
      },
    });
    if (!asset) throw new NotFoundException('Ativo não encontrado.');

    const cost = dec(asset.acquisitionValue);
    const accumulated = dec(asset.accumulatedDepreciation);
    const schedule = this.depreciation.schedule(asset);

    return {
      asset: { ...asset, records: undefined },
      categoryLabel: CATEGORY_LABELS[asset.category],
      accumulatedDepreciation: Number(accumulated.toFixed(2)),
      bookValue: Number(cost.minus(accumulated).toFixed(2)),
      monthlyDepreciation: schedule.monthly,
      depreciableBase: schedule.depreciableBase,
      schedule: schedule.rows,
      records: asset.records,
    };
  }

  async update(companyId: string, id: string, dto: UpdateAssetDto) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId },
      include: { _count: { select: { records: true } } },
    });
    if (!asset) throw new NotFoundException('Ativo não encontrado.');

    if (dto.assetAccountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: dto.assetAccountId, companyId },
      });
      if (!account) throw new NotFoundException('Conta contábil não encontrada.');
      if (account.type !== AccountType.ANALITICA || !account.active) {
        throw new BadRequestException('A conta do imobilizado deve ser analítica e ativa.');
      }
    }

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.supplierName !== undefined ? { supplierName: dto.supplierName } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.assetAccountId !== undefined ? { assetAccountId: dto.assetAccountId } : {}),
      },
    });

    await this.audit.log({
      companyId,
      userId: undefined,
      action: 'UPDATE',
      entity: 'Asset',
      entityId: id,
      description: `Ativo ${asset.code} atualizado.`,
    });

    return updated;
  }

  async transfer(companyId: string, id: string, dto: TransferAssetDto) {
    const asset = await this.prisma.asset.findFirst({ where: { id, companyId } });
    if (!asset) throw new NotFoundException('Ativo não encontrado.');
    if (asset.status === 'BAIXADO') {
      throw new BadRequestException('Ativos baixados não podem ser transferidos.');
    }
    const updated = await this.prisma.asset.update({
      where: { id },
      data: { location: dto.location, status: asset.status === 'TRANSFERIDO' ? 'TRANSFERIDO' : asset.status },
    });
    await this.audit.log({
      companyId,
      action: 'TRANSFER',
      entity: 'Asset',
      entityId: id,
      description: `Ativo ${asset.code} transferido para ${dto.location}.`,
    });
    return updated;
  }

  /** Baixa do ativo com contabilização: acumulada, recebimento e resultado. */
  async dispose(companyId: string, user: AuthUser, id: string, dto: DisposeAssetDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const asset = await tx.asset.findFirst({ where: { id, companyId } });
        if (!asset) throw new NotFoundException('Ativo não encontrado.');
        if (asset.status === 'BAIXADO') {
          throw new BadRequestException('Este ativo já foi baixado.');
        }

        const cost = dec(asset.acquisitionValue);
        const accumulated = dec(asset.accumulatedDepreciation);
        const bookValue = cost.minus(accumulated);
        const disposalValue = money(dto.value);
        const disposalDate = startOfDay(dto.date);

        if (disposalDate < asset.acquisitionDate) {
          throw new BadRequestException('A data da baixa deve ser posterior à aquisição.');
        }

        const lines = [] as PostingLine[];

        if (accumulated.greaterThan(0)) {
          const depreciationAccount = await tx.account.findFirst({
            where: { companyId, referenceCode: 'DEPRECIACAO_ACUMULADA' },
          });
          if (!depreciationAccount) {
            throw new BadRequestException('Conta de depreciação acumulada não configurada.');
          }
          lines.push({
            accountId: depreciationAccount.id,
            debit: accumulated,
            description: 'Eliminação da depreciação acumulada',
          });
        }

        const receivedRef =
          (dto.paymentMethod ?? PaymentMethod.DINHEIRO) === PaymentMethod.BANCO ? 'BANCO' : 'CAIXA';
        if (disposalValue.greaterThan(0)) {
          lines.push({
            accountRef: receivedRef,
            debit: disposalValue,
            description: 'Recebimento pela baixa do ativo',
          });
        }

        const bookMinusCash = bookValue.minus(disposalValue);
        if (bookMinusCash.greaterThan(0)) {
          lines.push({
            accountRef: 'PERDA_BAIXA_ATIVO',
            debit: bookMinusCash,
            description: 'Perda na baixa do ativo',
          });
        } else if (bookMinusCash.lessThan(0)) {
          lines.push({
            accountRef: 'GANHO_VENDA_ATIVO',
            credit: bookMinusCash.negated(),
            description: 'Ganho na venda do ativo',
          });
        }

        lines.push({
          accountId: asset.assetAccountId,
          credit: cost,
          description: 'Saída do ativo do imobilizado',
        });

        const entry = await this.journal.postEntry(tx, {
          companyId,
          date: disposalDate,
          history:
            `Baixa do ativo ${asset.name} (${asset.code})` +
            (dto.description ? ` — ${dto.description}` : ''),
          source: JournalSource.BAIXA_ATIVO,
          sourceId: asset.id,
          createdById: user.id,
          lines,
        });

        const updated = await tx.asset.update({
          where: { id: asset.id },
          data: {
            status: 'BAIXADO',
            disposalDate,
            disposalValue,
          },
        });

        await this.audit.log(
          {
            companyId,
            userId: user.id,
            action: 'DISPOSE',
            entity: 'Asset',
            entityId: asset.id,
            description: `Baixa do ativo ${asset.code} — valor contábil ${bookValue.toFixed(2)}, recebido ${disposalValue.toFixed(2)}.`,
          },
          tx,
        );

        return { message: 'Ativo baixado com sucesso.', entryId: entry.id, asset: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );
  }
}
