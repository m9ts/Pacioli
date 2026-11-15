import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { compareAccountCode } from '../common/utils/account-code';
import { CreateProductDto, ListProductsDto, UpdateProductDto } from './dto/stock.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAccountType(account: { type: AccountType; active: boolean }, label: string) {
    if (account.type !== AccountType.ANALITICA || !account.active) {
      throw new BadRequestException(`A conta ${label} deve ser analítica e estar ativa.`);
    }
  }

  async create(companyId: string, dto: CreateProductDto) {
    const existing = await this.prisma.product.findFirst({
      where: { companyId, code: dto.code },
    });
    if (existing) throw new BadRequestException(`Já existe um produto com o código ${dto.code}.`);

    const account = await this.prisma.account.findFirst({
      where: { id: dto.inventoryAccountId, companyId },
    });
    if (!account) throw new NotFoundException('Conta contábil de estoque não encontrada.');
    this.assertAccountType(account, 'de estoque');

    if (dto.revenueAccountId) {
      const revenue = await this.prisma.account.findFirst({
        where: { id: dto.revenueAccountId, companyId },
      });
      if (!revenue) throw new NotFoundException('Conta de receita não encontrada.');
      this.assertAccountType(revenue, 'de receita');
    }
    if (dto.cmvAccountId) {
      const cmv = await this.prisma.account.findFirst({ where: { id: dto.cmvAccountId, companyId } });
      if (!cmv) throw new NotFoundException('Conta de CMV não encontrada.');
      this.assertAccountType(cmv, 'de custo (CMV)');
    }

    return this.prisma.product.create({
      data: {
        companyId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: dto.description,
        category: dto.category.trim(),
        unit: dto.unit.trim().toUpperCase(),
        minimumStock: dto.minimumStock,
        salePrice: dto.salePrice,
        inventoryAccountId: dto.inventoryAccountId,
        revenueAccountId: dto.revenueAccountId,
        cmvAccountId: dto.cmvAccountId,
      },
      include: { inventoryAccount: { select: { code: true, name: true } } },
    });
  }

  async list(companyId: string, query: ListProductsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: Prisma.ProductWhereInput = {
      companyId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.active ? { active: query.active === 'true' } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, categories] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { inventoryAccount: { select: { code: true, name: true } } },
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where: { companyId },
        select: { category: true },
        distinct: ['category'],
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      categories: categories.map((c) => c.category).sort(),
    };
  }

  async options(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        quantity: true,
        averageCost: true,
        salePrice: true,
      },
      orderBy: { name: 'asc' },
    });
    return products;
  }

  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: {
        inventoryAccount: { select: { id: true, code: true, name: true } },
        revenueAccount: { select: { id: true, code: true, name: true } },
        cmvAccount: { select: { id: true, code: true, name: true } },
        movements: {
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          include: {
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const stockValue = new Prisma.Decimal(product.quantity).times(product.averageCost);
    return { ...product, stockValue: Number(stockValue.toFixed(2)) };
  }

  async update(companyId: string, id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({ where: { id, companyId } });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    if (dto.inventoryAccountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: dto.inventoryAccountId, companyId },
      });
      if (!account) throw new NotFoundException('Conta contábil de estoque não encontrada.');
      this.assertAccountType(account, 'de estoque');
    }

    const active =
      dto.active === undefined ? product.active : dto.active === 'true' || dto.active === true;

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim().toUpperCase() } : {}),
        ...(dto.minimumStock !== undefined ? { minimumStock: dto.minimumStock } : {}),
        ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
        ...(dto.inventoryAccountId !== undefined
          ? { inventoryAccountId: dto.inventoryAccountId }
          : {}),
        ...(dto.revenueAccountId !== undefined ? { revenueAccountId: dto.revenueAccountId } : {}),
        ...(dto.cmvAccountId !== undefined ? { cmvAccountId: dto.cmvAccountId } : {}),
        active,
      },
      include: { inventoryAccount: { select: { code: true, name: true } } },
    });

    if (dto.revenueAccountId && dto.revenueAccountId !== product.revenueAccountId) {
      const revenue = await this.prisma.account.findFirst({
        where: { id: dto.revenueAccountId, companyId },
      });
      if (revenue) this.assertAccountType(revenue, 'de receita');
    }
    return updated;
  }

  async remove(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: { _count: { select: { movements: true } } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    if (product._count.movements > 0) {
      throw new BadRequestException(
        'Este produto possui movimentações de estoque e não pode ser excluído. Você pode inativá-lo.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Produto excluído.' };
  }

  /** Saldos consolidados por produto para o relatório de estoque. */
  async summary(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, active: true },
      include: { inventoryAccount: { select: { code: true, name: true } } },
    });
    products.sort((a, b) => compareAccountCode(a.code, b.code));

    const rows = products.map((product) => {
      const stockValue = new Prisma.Decimal(product.quantity).times(product.averageCost);
      return {
        id: product.id,
        code: product.code,
        name: product.name,
        category: product.category,
        unit: product.unit,
        quantity: Number(product.quantity),
        minimumStock: Number(product.minimumStock),
        averageCost: Number(product.averageCost),
        salePrice: Number(product.salePrice),
        stockValue: Number(stockValue.toFixed(2)),
        inventoryAccount: product.inventoryAccount,
        lowStock: new Prisma.Decimal(product.quantity).lessThanOrEqualTo(product.minimumStock),
      };
    });

    const totalValue = rows.reduce((acc, row) => acc + row.stockValue, 0);
    return { rows, totalValue: Number(totalValue.toFixed(2)) };
  }
}
