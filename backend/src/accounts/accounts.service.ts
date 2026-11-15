import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account, AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { compareAccountCode } from '../common/utils/account-code';
import { CreateAccountDto, ListAccountsDto, UpdateAccountDto } from './dto/account.dto';
import { DEFAULT_CHART } from './default-chart';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria o plano de contas padrão da empresa (idempotente). */
  async createDefaultChart(companyId: string, tx: Prisma.TransactionClient) {
    const existing = await tx.account.count({ where: { companyId } });
    if (existing > 0) return { created: 0, existing };

    const idByCode = new Map<string, string>();
    let created = 0;

    for (const account of DEFAULT_CHART) {
      const data: Prisma.AccountUncheckedCreateInput = {
        companyId,
        code: account.code,
        name: account.name,
        description: account.description,
        classification: account.classification,
        nature: account.nature,
        type: account.type,
        statementGroup: account.statementGroup,
        dreGroup: account.dreGroup,
        referenceCode: account.referenceCode,
        isSystem: Boolean(account.referenceCode),
      };
      if (account.parentCode) {
        const parentId = idByCode.get(account.parentCode);
        if (!parentId) throw new Error(`Conta superior ${account.parentCode} não encontrada no plano padrão.`);
        data.parentId = parentId;
      }
      const createdAccount = await tx.account.create({ data });
      idByCode.set(account.code, createdAccount.id);
      created++;
    }

    return { created, existing: 0 };
  }

  async list(companyId: string, query: ListAccountsDto) {
    const accounts = await this.prisma.account.findMany({
      where: {
        companyId,
        ...(query.classification ? { classification: query.classification } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.active !== undefined ? { active: query.active } : {}),
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
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { children: true, lines: true } },
      },
    });

    accounts.sort((a, b) => compareAccountCode(a.code, b.code));
    return accounts.map((account) => ({
      ...account,
      hasChildren: account._count.children > 0,
      lineCount: account._count.lines,
      canDelete: account._count.children === 0 && account._count.lines === 0,
      _count: undefined,
    }));
  }

  /** Lista contas analíticas ativas para uso em lançamentos. */
  async entryOptions(companyId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId, active: true, type: AccountType.ANALITICA },
      select: {
        id: true,
        code: true,
        name: true,
        nature: true,
        classification: true,
        referenceCode: true,
      },
    });
    return accounts.sort((a, b) => compareAccountCode(a.code, b.code));
  }

  async tree(companyId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
    accounts.sort((a, b) => compareAccountCode(a.code, b.code));

    const nodeById = new Map<string, any>();
    const roots: any[] = [];
    for (const account of accounts) {
      nodeById.set(account.id, { ...account, children: [] });
    }
    for (const account of accounts) {
      const node = nodeById.get(account.id);
      if (account.parentId && nodeById.has(account.parentId)) {
        nodeById.get(account.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async findOne(companyId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, companyId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
    });
    if (!account) throw new NotFoundException('Conta contábil não encontrada.');
    return account;
  }

  async create(companyId: string, dto: CreateAccountDto) {
    const exists = await this.prisma.account.findFirst({
      where: { companyId, code: dto.code },
    });
    if (exists) throw new ConflictException(`Já existe uma conta com o código ${dto.code}.`);

    let parent: Account | null = null;
    if (dto.parentId) {
      parent = await this.prisma.account.findFirst({ where: { id: dto.parentId, companyId } });
      if (!parent) throw new NotFoundException('Conta superior não encontrada.');
      if (parent.type === AccountType.ANALITICA) {
        throw new BadRequestException('Uma conta analítica não pode receber contas filhas.');
      }
      if (parent.classification !== dto.classification) {
        throw new BadRequestException('A classificação deve ser igual à da conta superior.');
      }
      if (!dto.code.startsWith(`${parent.code}.`)) {
        throw new BadRequestException(
          `O código da conta filha deve iniciar com o código da conta superior (${parent.code}.).`,
        );
      }
    }

    if (dto.referenceCode) {
      const refExists = await this.prisma.account.findFirst({
        where: { companyId, referenceCode: dto.referenceCode },
      });
      if (refExists) {
        throw new ConflictException('Este código de referência já está em uso por outra conta.');
      }
    }

    if (dto.referenceCode && !dto.referenceCode.trim()) dto.referenceCode = undefined;

    const account = await this.prisma.account.create({
      data: {
        companyId,
        code: dto.code,
        name: dto.name.trim(),
        description: dto.description,
        classification: dto.classification,
        nature: dto.nature,
        type: dto.type,
        statementGroup: dto.statementGroup,
        dreGroup: dto.dreGroup,
        referenceCode: dto.referenceCode || null,
        parentId: parent?.id ?? null,
      },
    });

    if (parent && parent.statementGroup && !dto.statementGroup) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { statementGroup: parent.statementGroup },
      });
    }
    return account;
  }

  async update(companyId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.prisma.account.findFirst({
      where: { id, companyId },
      include: { _count: { select: { children: true, lines: true } } },
    });
    if (!account) throw new NotFoundException('Conta contábil não encontrada.');

    if (account.isSystem && dto.type === AccountType.SINTETICA) {
      throw new BadRequestException('Contas vinculadas a rotinas automáticas devem permanecer analíticas.');
    }
    if (dto.type === AccountType.SINTETICA && account._count.lines > 0) {
      throw new BadRequestException(
        'Esta conta possui lançamentos e não pode ser convertida em sintética. Estorne os lançamentos primeiro.',
      );
    }
    if (dto.type === AccountType.SINTETICA && account._count.children === 0) {
      // permitido: a conta sintética poderá receber filhas
    }
    if (dto.type === AccountType.ANALITICA && account._count.children > 0) {
      throw new BadRequestException('Esta conta possui contas filhas e não pode ser convertida em analítica.');
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        // move para raiz
      } else {
        if (dto.parentId === id) throw new BadRequestException('A conta não pode ser superior de si mesma.');
        const parent = await this.prisma.account.findFirst({
          where: { id: dto.parentId, companyId },
        });
        if (!parent) throw new NotFoundException('Conta superior não encontrada.');
        if (parent.type === AccountType.ANALITICA) {
          throw new BadRequestException('Uma conta analítica não pode receber contas filhas.');
        }
        if (account._count.lines > 0) {
          throw new BadRequestException('Não é possível mover uma conta que já possui lançamentos.');
        }
      }
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.nature !== undefined ? { nature: dto.nature } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.statementGroup !== undefined ? { statementGroup: dto.statementGroup } : {}),
        ...(dto.dreGroup !== undefined ? { dreGroup: dto.dreGroup } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return updated;
  }

  async remove(companyId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, companyId },
      include: {
        _count: { select: { children: true, lines: true, products: true } },
      },
    });
    if (!account) throw new NotFoundException('Conta contábil não encontrada.');
    if (account.isSystem) {
      throw new BadRequestException(
        'Contas padrão vinculadas a rotinas automáticas não podem ser excluídas. Você pode inativá-las.',
      );
    }
    if (account._count.children > 0) {
      throw new BadRequestException('Exclua ou mova as contas filhas antes de excluir esta conta.');
    }
    if (account._count.lines > 0) {
      throw new BadRequestException(
        'Esta conta possui lançamentos contábeis e não pode ser excluída. Utilize a inativação.',
      );
    }
    await this.prisma.account.delete({ where: { id } });
    return { message: 'Conta excluída com sucesso.' };
  }
}
