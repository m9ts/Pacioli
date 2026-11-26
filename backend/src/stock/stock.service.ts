import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  JournalSource,
  PaymentMethod,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JournalService, PostingLine } from '../journal/journal.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { dec, formatQuantity, money, quantity as q3, unitCost as uc4 } from '../common/utils/decimal';
import { startOfDay } from '../common/utils/date';
import { CreateStockMovementDto, ListMovementsDto, ReverseStockDto } from './dto/stock.dto';

const IN_TYPES = [
  StockMovementType.COMPRA,
  StockMovementType.ENTRADA,
  StockMovementType.DEVOLUCAO_VENDA,
];
const OUT_TYPES = [
  StockMovementType.VENDA,
  StockMovementType.SAIDA,
  StockMovementType.DEVOLUCAO_COMPRA,
];

const SOURCE_BY_TYPE: Partial<Record<StockMovementType, JournalSource>> = {
  [StockMovementType.COMPRA]: JournalSource.COMPRA,
  [StockMovementType.VENDA]: JournalSource.VENDA,
  [StockMovementType.ENTRADA]: JournalSource.AJUSTE_ESTOQUE,
  [StockMovementType.SAIDA]: JournalSource.AJUSTE_ESTOQUE,
  [StockMovementType.DEVOLUCAO_VENDA]: JournalSource.DEVOLUCAO,
  [StockMovementType.DEVOLUCAO_COMPRA]: JournalSource.DEVOLUCAO,
};

const TYPE_LABELS: Record<StockMovementType, string> = {
  COMPRA: 'Compra de mercadorias',
  VENDA: 'Venda de mercadorias',
  ENTRADA: 'Entrada por ajuste',
  SAIDA: 'Saída por ajuste',
  AJUSTE: 'Ajuste de estoque',
  DEVOLUCAO_VENDA: 'Devolução de venda',
  DEVOLUCAO_COMPRA: 'Devolução de compra',
  ESTORNO: 'Estorno de movimentação',
};

interface StockEntryInput {
  productId: string;
  type: StockMovementType;
  date: string;
  quantity: number;
  unitValue?: number;
  totalValue?: number;
  paymentMethod: PaymentMethod;
  documentNumber?: string;
  description?: string;
  customerId?: string;
  supplierId?: string;
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  /** Resolve a conta contrapartida conforme a forma de pagamento e o tipo. */
  private paymentRef(type: StockMovementType, method: PaymentMethod): string | null {
    if (method === PaymentMethod.DINHEIRO) return 'CAIXA';
    if (method === PaymentMethod.BANCO) return 'BANCO';
    // A prazo: compras pagam a fornecedores; vendas e devoluções de venda em geral
    return type === StockMovementType.COMPRA || type === StockMovementType.DEVOLUCAO_COMPRA
      ? 'FORNECEDORES'
      : 'CLIENTES';
  }

  /** Cria movimentação de estoque com custo médio ponderado móvel e escrituração automática. */
  async createMovement(companyId: string, user: AuthUser, dto: CreateStockMovementDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const type = dto.type;
    if (type === StockMovementType.ESTORNO || type === StockMovementType.AJUSTE) {
      throw new BadRequestException('Tipo de movimentação inválido.');
    }
    const isIn = IN_TYPES.includes(type as (typeof IN_TYPES)[number]);
    const isOut = OUT_TYPES.includes(type as (typeof OUT_TYPES)[number]);

    const qty = q3(dto.quantity);
    if (qty.lessThanOrEqualTo(0)) {
      throw new BadRequestException('A quantidade deve ser maior que zero.');
    }
    if (isIn && type !== StockMovementType.DEVOLUCAO_VENDA && (dto.unitValue ?? 0) <= 0) {
      throw new BadRequestException('Informe o custo unitário da mercadoria.');
    }
    if (isOut && (dto.unitValue ?? 0) <= 0 && type !== StockMovementType.SAIDA) {
      throw new BadRequestException('Informe o valor unitário da operação.');
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, companyId },
          include: { inventoryAccount: true },
        });
        if (!product) throw new NotFoundException('Produto não encontrado.');
        if (!product.active) throw new BadRequestException('Este produto está inativo.');

        const inventoryAccount = product.inventoryAccount;
        if (!inventoryAccount || inventoryAccount.type !== AccountType.ANALITICA) {
          throw new BadRequestException(
            'A conta contábil de estoque do produto não está configurada corretamente.',
          );
        }

        const currentQty = dec(product.quantity);
        const currentAvg = dec(product.averageCost);

        let totalValue: Prisma.Decimal;
        let unitCostUsed: Prisma.Decimal;

        if (isIn) {
          totalValue = dto.totalValue
            ? money(dto.totalValue)
            : money(uc4(dec(dto.unitValue ?? 0).times(qty)));
          unitCostUsed = qty.isZero() ? dec(0) : totalValue.div(qty).toDecimalPlaces(4);
        } else {
          if (type === StockMovementType.SAIDA) {
            totalValue = money(currentAvg.times(qty));
          } else {
            totalValue = dto.totalValue
              ? money(dto.totalValue)
              : money(uc4(dec(dto.unitValue ?? 0).times(qty)));
          }
          unitCostUsed = currentAvg;
        }

        if (totalValue.lessThanOrEqualTo(0)) {
          throw new BadRequestException('O valor total da operação deve ser maior que zero.');
        }

        let newQty: Prisma.Decimal;
        let newAvg = currentAvg;

        if (isIn) {
          newQty = currentQty.plus(qty);
          if (type !== StockMovementType.DEVOLUCAO_VENDA) {
            const previousValue = currentQty.times(currentAvg);
            newAvg = previousValue.plus(totalValue).div(newQty).toDecimalPlaces(4);
          }
        } else {
          newQty = currentQty.minus(qty);
          if (newQty.lessThan(0) && !company.allowNegativeStock) {
            throw new BadRequestException(
              `Estoque insuficiente para "${product.name}": disponível ${formatQuantity(currentQty)} ${product.unit}, solicitado ${formatQuantity(qty)} ${product.unit}.`,
            );
          }
        }

        const date = startOfDay(dto.date);
        const history = this.buildHistory(type, product, qty, totalValue, dto);
        const source = SOURCE_BY_TYPE[type]!;

        // Movimentação criada primeiro para vincular os lançamentos por sourceId.
        const movement = await tx.stockMovement.create({
          data: {
            companyId,
            productId: product.id,
            type,
            date,
            quantity: qty,
            unitCost: uc4(unitCostUsed),
            totalValue,
            balanceAfter: newQty,
            paymentMethod: dto.paymentMethod,
            documentNumber: dto.documentNumber,
            description: dto.description,
            customerId: dto.customerId,
            supplierId: dto.supplierId,
            createdById: user.id,
          },
        });

        const firstEntry = await this.postAccountingEntries(tx, {
          companyId,
          user,
          product,
          inventoryAccountId: inventoryAccount.id,
          type,
          source,
          sourceId: movement.id,
          date,
          history,
          qty,
          totalValue,
          cogsValue: money(currentAvg.times(qty)),
          paymentMethod: dto.paymentMethod,
          documentNumber: dto.documentNumber,
        });

        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: { quantity: newQty, averageCost: newAvg },
        });

        const saved = await tx.stockMovement.update({
          where: { id: movement.id },
          data: { journalEntryId: firstEntry },
          include: { product: { select: { name: true, unit: true } } },
        });

        await this.audit.log(
          {
            companyId,
            userId: user.id,
            action: 'CREATE',
            entity: 'StockMovement',
            entityId: movement.id,
            description: `${TYPE_LABELS[type]}: ${formatQuantity(qty)} ${product.unit} de ${product.name} (${money(totalValue).toFixed(2)}).`,
          },
          tx,
        );

        return { movement: saved, product: updatedProduct };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );

    return result.movement;
  }

  private buildHistory(
    type: StockMovementType,
    product: { name: string; unit: string },
    qty: Prisma.Decimal,
    totalValue: Prisma.Decimal,
    dto: { documentNumber?: string; description?: string },
  ): string {
    const base = `${TYPE_LABELS[type]}: ${formatQuantity(qty)} ${product.unit} de ${product.name}`;
    const document = dto.documentNumber ? ` (doc. ${dto.documentNumber})` : '';
    const description = dto.description ? ` — ${dto.description}` : '';
    return `${base}${document}${description}`.slice(0, 300);
  }

  private async postAccountingEntries(
    tx: Prisma.TransactionClient,
    params: {
      companyId: string;
      user: AuthUser;
      product: Prisma.ProductGetPayload<{ include: { inventoryAccount: true } }>;
      inventoryAccountId: string;
      type: StockMovementType;
      source: JournalSource;
      sourceId: string;
      date: Date;
      history: string;
      qty: Prisma.Decimal;
      totalValue: Prisma.Decimal;
      cogsValue: Prisma.Decimal;
      paymentMethod: PaymentMethod;
      documentNumber?: string;
    },
  ): Promise<string> {
    const { product, type } = params;
    const paymentRef = this.paymentRef(type, params.paymentMethod);

    const revenueAccountId = product.revenueAccountId;
    const cmvAccountId = product.cmvAccountId;

    const lines = (arr: PostingLine[]) => arr.filter((l) => Object.keys(l).length > 0);

    let firstEntryId = '';

    switch (type) {
      case StockMovementType.COMPRA:
      case StockMovementType.ENTRADA: {
        const counterpartRef =
          type === StockMovementType.COMPRA
            ? paymentRef
            : 'AJUSTE_ESTOQUE';
        const entry = await this.journal.postEntry(tx, {
          companyId: params.companyId,
          date: params.date,
          history: params.history,
          source: params.source,
          sourceId: params.sourceId,
          createdById: params.user.id,
          lines: lines([
            { accountId: params.inventoryAccountId, debit: params.totalValue, description: 'Entrada de mercadorias' },
            { accountRef: counterpartRef ?? undefined, credit: params.totalValue, description: 'Contrapartida da entrada' },
          ]),
        });
        firstEntryId = entry.id;
        break;
      }
      case StockMovementType.VENDA: {
        const revenueEntry = await this.journal.postEntry(tx, {
          companyId: params.companyId,
          date: params.date,
          history: params.history,
          source: params.source,
          sourceId: params.sourceId,
          createdById: params.user.id,
          lines: [
            { accountRef: paymentRef ?? undefined, debit: params.totalValue, description: 'Recebimento da venda' },
            {
              ...(revenueAccountId ? { accountId: revenueAccountId } : { accountRef: 'RECEITA_VENDAS' }),
              credit: params.totalValue,
              description: 'Receita de venda de mercadorias',
            },
          ],
        });
        firstEntryId = revenueEntry.id;

        if (params.cogsValue.greaterThan(0)) {
          await this.journal.postEntry(tx, {
            companyId: params.companyId,
            date: params.date,
            history: `CMV referente: ${params.history}`,
            source: params.source,
            sourceId: params.sourceId,
            createdById: params.user.id,
            lines: [
              {
                ...(cmvAccountId ? { accountId: cmvAccountId } : { accountRef: 'CMV' }),
                debit: params.cogsValue,
                description: 'Custo das mercadorias vendidas',
              },
              { accountId: params.inventoryAccountId, credit: params.cogsValue, description: 'Baixa de estoque' },
            ],
          });
        }
        break;
      }
      case StockMovementType.SAIDA: {
        const entry = await this.journal.postEntry(tx, {
          companyId: params.companyId,
          date: params.date,
          history: params.history,
          source: params.source,
          sourceId: params.sourceId,
          createdById: params.user.id,
          lines: [
            { accountRef: 'PERDA_ESTOQUE', debit: params.totalValue, description: 'Perda/saída por ajuste' },
            { accountId: params.inventoryAccountId, credit: params.totalValue, description: 'Saída de estoque' },
          ],
        });
        firstEntryId = entry.id;
        break;
      }
      case StockMovementType.DEVOLUCAO_VENDA: {
        const entry = await this.journal.postEntry(tx, {
          companyId: params.companyId,
          date: params.date,
          history: params.history,
          source: params.source,
          sourceId: params.sourceId,
          createdById: params.user.id,
          lines: [
            { accountRef: 'DEDUCAO_DEVOLUCOES', debit: params.totalValue, description: 'Devolução de vendas' },
            { accountRef: paymentRef ?? undefined, credit: params.totalValue, description: 'Devolução do valor ao cliente' },
          ],
        });
        firstEntryId = entry.id;

        const stockCost = money(dec(product.averageCost).times(params.qty));
        if (stockCost.greaterThan(0)) {
          await this.journal.postEntry(tx, {
            companyId: params.companyId,
            date: params.date,
            history: `Retorno ao estoque: ${params.history}`,
            source: params.source,
            sourceId: params.sourceId,
            createdById: params.user.id,
            lines: [
              { accountId: params.inventoryAccountId, debit: stockCost, description: 'Mercadoria devolvida ao estoque' },
              {
                ...(cmvAccountId ? { accountId: cmvAccountId } : { accountRef: 'CMV' }),
                credit: stockCost,
                description: 'Estorno do CMV',
              },
            ],
          });
        }
        break;
      }
      case StockMovementType.DEVOLUCAO_COMPRA: {
        const entry = await this.journal.postEntry(tx, {
          companyId: params.companyId,
          date: params.date,
          history: params.history,
          source: params.source,
          sourceId: params.sourceId,
          createdById: params.user.id,
          lines: [
            { accountRef: paymentRef ?? undefined, debit: params.totalValue, description: 'Devolução ao fornecedor' },
            { accountId: params.inventoryAccountId, credit: params.totalValue, description: 'Saída de estoque por devolução' },
          ],
        });
        firstEntryId = entry.id;
        break;
      }
      default:
        throw new BadRequestException('Tipo de movimentação não suportado.');
    }

    return firstEntryId;
  }

  async list(companyId: string, query: ListMovementsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.StockMovementWhereInput = {
      companyId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: startOfDay(query.from) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true, unit: true } },
          customer: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          entry: { select: { id: true, number: true } },
          reversalOf: { select: { id: true, type: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(companyId: string, id: string) {
    const movement = await this.prisma.stockMovement.findFirst({
      where: { id, companyId },
      include: {
        product: true,
        customer: true,
        supplier: true,
        entry: true,
        reversalOf: true,
      },
    });
    if (!movement) throw new NotFoundException('Movimentação não encontrada.');
    return movement;
  }

  /** Estorna a movimentação: devolve quantidade e estorna os lançamentos contábeis. */
  async reverse(companyId: string, user: AuthUser, id: string, dto: ReverseStockDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const movement = await tx.stockMovement.findFirst({
          where: { id, companyId },
          include: { product: true, reversedBy: true },
        });
        if (!movement) throw new NotFoundException('Movimentação não encontrada.');
        if (movement.type === StockMovementType.ESTORNO) {
          throw new BadRequestException('Um estorno não pode ser estornado.');
        }
        if (movement.reversedBy) {
          throw new BadRequestException('Esta movimentação já foi estornada.');
        }

        const company = await tx.company.findUnique({ where: { id: companyId } });
        if (!company) throw new NotFoundException('Empresa não encontrada.');

        const isIn = IN_TYPES.includes(movement.type as (typeof IN_TYPES)[number]);
        const qty = dec(movement.quantity);
        const currentQty = dec(movement.product.quantity);

        let newQty: Prisma.Decimal;
        if (isIn) {
          newQty = currentQty.minus(qty);
          if (newQty.lessThan(0) && !company.allowNegativeStock) {
            throw new BadRequestException(
              `Não é possível estornar: o estoque atual de "${movement.product.name}" (${formatQuantity(currentQty)}) é menor que a quantidade da movimentação (${formatQuantity(qty)}).`,
            );
          }
        } else {
          newQty = currentQty.plus(qty);
        }

        // Estorna todos os lançamentos gerados por esta movimentação.
        const entries = await tx.journalEntry.findMany({
          where: {
            companyId,
            sourceId: movement.id,
            source: {
              in: [JournalSource.COMPRA, JournalSource.VENDA, JournalSource.AJUSTE_ESTOQUE, JournalSource.DEVOLUCAO],
            },
          },
          orderBy: { number: 'asc' },
        });
        for (const entry of entries) {
          await this.journal.reverseInTransaction(tx, companyId, user.id, entry.id, dto.reason);
        }

        const reversal = await tx.stockMovement.create({
          data: {
            companyId,
            productId: movement.productId,
            type: StockMovementType.ESTORNO,
            date: new Date(),
            quantity: qty,
            unitCost: movement.unitCost,
            totalValue: movement.totalValue,
            balanceAfter: newQty,
            paymentMethod: movement.paymentMethod,
            documentNumber: movement.documentNumber,
            description: `Estorno de ${TYPE_LABELS[movement.type]} — ${dto.reason}`.slice(0, 300),
            reversalOfId: movement.id,
            createdById: user.id,
          },
        });

        await tx.product.update({
          where: { id: movement.productId },
          data: { quantity: newQty },
        });
        await tx.stockMovement.update({
          where: { id: movement.id },
          data: { status: 'ESTORNADO' },
        });

        await this.audit.log(
          {
            companyId,
            userId: user.id,
            action: 'REVERSE',
            entity: 'StockMovement',
            entityId: movement.id,
            description: `Movimentação de ${TYPE_LABELS[movement.type]} (${formatQuantity(qty)} ${movement.product.unit}) estornada.`,
            metadata: { reason: dto.reason, entries: entries.length },
          },
          tx,
        );

        return { message: 'Movimentação estornada com sucesso.', reversalId: reversal.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );
  }
}
