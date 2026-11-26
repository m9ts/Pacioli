import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountClassification,
  AccountType,
  CompanyStatus,
  JournalSource,
  Prisma,
  RoleName,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from '../journal/journal.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { dec, money } from '../common/utils/decimal';
import { endOfDay, startOfDay, toISODate } from '../common/utils/date';
import {
  AddMemberDto,
  CompleteOpeningDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from './dto/company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
    private readonly audit: AuditService,
  ) {}

  async resolveAccess(user: AuthUser, companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { members: { where: { userId: user.id }, include: { role: true } } },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const isOwner = company.ownerId === user.id;
    const membership = company.members[0];
    let accessRole: RoleName | null = null;
    if (user.role === RoleName.ADMIN) accessRole = RoleName.ADMIN;
    else if (isOwner) accessRole = RoleName.ALUNO;
    else if (membership) accessRole = membership.role?.name ?? RoleName.PROFESSOR;

    if (!accessRole) throw new ForbiddenException('Você não tem acesso a esta empresa.');
    return {
      company,
      isOwner,
      accessRole,
      canWrite: accessRole !== RoleName.PROFESSOR,
    };
  }

  async create(user: AuthUser, dto: CreateCompanyDto) {
    if (dto.cnpj) {
      const existing = await this.prisma.company.findFirst({ where: { cnpj: dto.cnpj } });
      if (existing) {
        throw new ConflictException(
          `Já existe uma empresa cadastrada com este CNPJ (${existing.tradeName}).`,
        );
      }
    }

    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          ownerId: user.id,
          legalName: dto.legalName.trim(),
          tradeName: dto.tradeName.trim(),
          cnpj: dto.cnpj || null,
          stateRegistration: dto.stateRegistration,
          cityRegistration: dto.cityRegistration,
          zipCode: dto.zipCode,
          street: dto.street,
          number: dto.number,
          complement: dto.complement,
          district: dto.district,
          city: dto.city,
          state: dto.state?.toUpperCase(),
          phone: dto.phone,
          email: dto.email,
          segment: dto.segment,
          activity: dto.activity,
          openingDate: startOfDay(dto.openingDate),
          responsibleName: dto.responsibleName.trim(),
          responsibleCpf: dto.responsibleCpf,
          initialCapital: money(dto.initialCapital),
          status: CompanyStatus.DRAFT,
        },
      });

      await tx.companyMember.create({
        data: {
          companyId: created.id,
          userId: user.id,
          roleId: (await this.prisma.role.findUnique({ where: { name: RoleName.ALUNO } }))?.id,
        },
      });

      await this.accounts.createDefaultChart(created.id, tx);

      await this.audit.log(
        {
          companyId: created.id,
          userId: user.id,
          action: 'CREATE',
          entity: 'Company',
          entityId: created.id,
          description: `Empresa "${created.tradeName}" cadastrada com plano de contas padrão.`,
        },
        tx,
      );

      return created;
    });

    return company;
  }

  async list(user: AuthUser) {
    const where: Prisma.CompanyWhereInput =
      user.role === RoleName.ADMIN
        ? {}
        : {
            OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
          };

    const companies = await this.prisma.company.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { accounts: true, entries: true, products: true, assets: true } },
        members: { where: { userId: user.id }, include: { role: true } },
      },
    });

    return companies.map((company) => {
      const isOwner = company.ownerId === user.id;
      const accessRole =
        user.role === RoleName.ADMIN
          ? RoleName.ADMIN
          : isOwner
            ? RoleName.ALUNO
            : (company.members[0]?.role?.name ?? RoleName.PROFESSOR);
      return {
        id: company.id,
        legalName: company.legalName,
        tradeName: company.tradeName,
        cnpj: company.cnpj,
        city: company.city,
        state: company.state,
        segment: company.segment,
        status: company.status,
        initialCapital: company.initialCapital,
        openingDate: company.openingDate,
        openingCompletedAt: company.openingCompletedAt,
        isOwner,
        accessRole,
        canWrite: accessRole !== RoleName.PROFESSOR,
        counts: company._count,
      };
    });
  }

  async findOne(user: AuthUser, id: string) {
    const { company, accessRole, canWrite, isOwner } = await this.resolveAccess(user, id);
    const full = await this.prisma.company.findUnique({
      where: { id: company.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        periods: { orderBy: { startDate: 'desc' } },
        _count: { select: { accounts: true, entries: true, products: true, assets: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } }, role: true },
        },
      },
    });
    return { ...full, accessRole, canWrite, isOwner };
  }

  async update(user: AuthUser, id: string, dto: UpdateCompanyDto) {
    const { canWrite } = await this.resolveAccess(user, id);
    if (!canWrite) throw new ForbiddenException('Perfil sem permissão para editar a empresa.');

    if (dto.cnpj) {
      const existing = await this.prisma.company.findFirst({
        where: { cnpj: dto.cnpj, NOT: { id } },
      });
      if (existing) throw new ConflictException('Já existe outra empresa com este CNPJ.');
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.legalName !== undefined ? { legalName: dto.legalName.trim() } : {}),
        ...(dto.tradeName !== undefined ? { tradeName: dto.tradeName.trim() } : {}),
        ...(dto.cnpj !== undefined ? { cnpj: dto.cnpj || null } : {}),
        ...(dto.stateRegistration !== undefined ? { stateRegistration: dto.stateRegistration } : {}),
        ...(dto.zipCode !== undefined ? { zipCode: dto.zipCode } : {}),
        ...(dto.street !== undefined ? { street: dto.street } : {}),
        ...(dto.number !== undefined ? { number: dto.number } : {}),
        ...(dto.complement !== undefined ? { complement: dto.complement } : {}),
        ...(dto.district !== undefined ? { district: dto.district } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.state !== undefined ? { state: dto.state?.toUpperCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.segment !== undefined ? { segment: dto.segment } : {}),
        ...(dto.activity !== undefined ? { activity: dto.activity } : {}),
        ...(dto.openingDate !== undefined ? { openingDate: startOfDay(dto.openingDate) } : {}),
        ...(dto.responsibleName !== undefined ? { responsibleName: dto.responsibleName } : {}),
        ...(dto.responsibleCpf !== undefined ? { responsibleCpf: dto.responsibleCpf } : {}),
      },
    });

    await this.audit.log({
      companyId: id,
      userId: user.id,
      action: 'UPDATE',
      entity: 'Company',
      entityId: id,
      description: 'Dados cadastrais da empresa atualizados.',
    });
    return updated;
  }

  async openingState(user: AuthUser, id: string) {
    const { company, canWrite } = await this.resolveAccess(user, id);
    const [periods, accountCount, entries, analyticCount] = await Promise.all([
      this.prisma.accountingPeriod.findMany({
        where: { companyId: id },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.account.count({ where: { companyId: id } }),
      this.prisma.journalEntry.findMany({
        where: { companyId: id, source: { in: [JournalSource.ABERTURA, JournalSource.SALDO_INICIAL] } },
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
        orderBy: { number: 'asc' },
      }),
      this.prisma.account.count({ where: { companyId: id, type: AccountType.ANALITICA } }),
    ]);

    return {
      company: {
        id: company.id,
        tradeName: company.tradeName,
        legalName: company.legalName,
        status: company.status,
        openingDate: company.openingDate,
        initialCapital: company.initialCapital,
        openingCompletedAt: company.openingCompletedAt,
      },
      canConfigure: canWrite && company.status !== CompanyStatus.ACTIVE,
      periods,
      accountCount,
      analyticCount,
      entries,
    };
  }

  /**
   * Conclui a abertura empresarial em uma única transação:
   * período contábil, capital social e patrimônio inicial.
   */
  async completeOpening(user: AuthUser, id: string, dto: CompleteOpeningDto) {
    const { company, canWrite } = await this.resolveAccess(user, id);
    if (!canWrite) throw new ForbiddenException('Perfil sem permissão para configurar a empresa.');
    if (company.status === CompanyStatus.ACTIVE) {
      throw new BadRequestException(
        'A abertura desta empresa já foi concluída. Correções devem ser feitas por lançamentos de ajuste.',
      );
    }

    const start = startOfDay(dto.period.startDate);
    const end = endOfDay(dto.period.endDate);
    if (start > end) throw new BadRequestException('A data inicial do período deve ser anterior à final.');
    if (dto.capital <= 0) throw new BadRequestException('Informe um capital social maior que zero.');

    const capitalAmount = money(dto.capital);
    if (capitalAmount.lessThan(money(company.initialCapital))) {
      throw new BadRequestException(
        `O capital social integralizado (${capitalAmount.toFixed(2)}) não pode ser menor que o capital social cadastrado (${money(company.initialCapital).toFixed(2)}).`,
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        const existingPeriods = await tx.accountingPeriod.count({ where: { companyId: id } });
        if (existingPeriods > 0) {
          throw new BadRequestException('Já existe período contábil configurado para esta empresa.');
        }

        const period = await tx.accountingPeriod.create({
          data: {
            companyId: id,
            name: dto.period.name,
            startDate: start,
            endDate: end,
            status: 'OPEN',
          },
        });

        // Capital social
        const capitalAccount = dto.capitalAccountId
          ? await tx.account.findFirst({
              where: { id: dto.capitalAccountId, companyId: id, active: true },
            })
          : null;
        if (dto.capitalAccountId && !capitalAccount) {
          throw new BadRequestException('Conta de integralização do capital não encontrada.');
        }
        const cashAccount =
          capitalAccount ??
          (await this.journal.accountByRef(tx, id, 'CAIXA', 'registrar a integralização do capital'));

        const capitalEntry = await this.journal.postEntry(tx, {
          companyId: id,
          date: start,
          history: `Integralização do capital social — ${dto.period.name}`,
          source: JournalSource.ABERTURA,
          sourceId: 'CAPITAL_SOCIAL',
          createdById: user.id,
          periodId: period.id,
          lines: [
            {
              accountId: cashAccount.id,
              debit: capitalAmount,
              description: 'Ingresso do capital social',
            },
            {
              accountRef: 'CAPITAL_SOCIAL',
              credit: capitalAmount,
              description: 'Capital social integralizado',
            },
          ],
        });

        // Patrimônio inicial (bens, direitos e obrigações)
        let patrimonyEntry: unknown = null;
        const items = dto.items ?? [];
        if (items.length > 0) {
          const accounts = await tx.account.findMany({
            where: { companyId: id, id: { in: [...new Set(items.map((i) => i.accountId))] } },
          });
          const accountById = new Map(accounts.map((a) => [a.id, a]));

          let totalAssets = dec(0);
          let totalLiabilities = dec(0);
          const lines: any[] = [];

          for (const item of items) {
            const account = accountById.get(item.accountId);
            if (!account) throw new BadRequestException(`Conta do item "${item.description}" não encontrada.`);
            if (account.type !== AccountType.ANALITICA || !account.active) {
              throw new BadRequestException(
                `A conta ${account.code} — ${account.name} não aceita lançamentos.`,
              );
            }
            const value = money(item.value);
            if (item.kind === 'OBRIGACAO') {
              if (account.classification !== AccountClassification.PASSIVO) {
                throw new BadRequestException(
                  `Obrigações devem usar contas do Passivo. A conta ${account.code} é ${account.classification}.`,
                );
              }
              totalLiabilities = totalLiabilities.plus(value);
              lines.push({ accountId: account.id, credit: value, description: item.description });
            } else {
              if (account.classification !== AccountClassification.ATIVO) {
                throw new BadRequestException(
                  `Bens e direitos devem usar contas do Ativo. A conta ${account.code} é ${account.classification}.`,
                );
              }
              totalAssets = totalAssets.plus(value);
              lines.push({ accountId: account.id, debit: value, description: item.description });
            }
          }

          if (totalLiabilities.greaterThan(totalAssets)) {
            throw new BadRequestException(
              'As obrigações iniciais não podem superar o total de bens e direitos.',
            );
          }
          const cashApplied = totalAssets.minus(totalLiabilities);
          if (cashApplied.greaterThan(capitalAmount)) {
            throw new BadRequestException(
              `O patrimônio inicial líquido (${cashApplied.toFixed(2)}) excede o capital integralizado (${capitalAmount.toFixed(2)}). ` +
                'Ajuste os valores ou aumente o capital social.',
            );
          }
          if (cashApplied.greaterThan(0)) {
            lines.push({
              accountId: cashAccount.id,
              credit: cashApplied,
              description: 'Pagamento do patrimônio inicial com recursos do capital',
            });
          }

          patrimonyEntry = await this.journal.postEntry(tx, {
            companyId: id,
            date: start,
            history: 'Registro do patrimônio inicial — bens, direitos e obrigações',
            source: JournalSource.ABERTURA,
            sourceId: 'PATRIMONIO_INICIAL',
            createdById: user.id,
            periodId: period.id,
            lines,
          });
        }

        // Saldos iniciais complementares
        let extraEntry: unknown = null;
        if (dto.extraLines && dto.extraLines.length > 0) {
          const debit = dto.extraLines.reduce((acc, l) => acc.plus(money(l.debit ?? 0)), dec(0));
          const credit = dto.extraLines.reduce((acc, l) => acc.plus(money(l.credit ?? 0)), dec(0));
          if (!debit.equals(credit)) {
            throw new BadRequestException(
              `Os saldos iniciais complementares estão desequilibrados (débitos ${debit.toFixed(2)} x créditos ${credit.toFixed(2)}).`,
            );
          }
          extraEntry = await this.journal.postEntry(tx, {
            companyId: id,
            date: start,
            history: 'Saldos iniciais complementares',
            source: JournalSource.SALDO_INICIAL,
            sourceId: 'SALDOS_INICIAIS',
            createdById: user.id,
            periodId: period.id,
            lines: dto.extraLines,
          });
        }

        await tx.company.update({
          where: { id },
          data: {
            status: CompanyStatus.ACTIVE,
            openingCompletedAt: new Date(),
            // A abertura é a fonte da verdade: capital e data inicial vêm do período informado.
            initialCapital: capitalAmount,
            openingDate: start,
          },
        });

        await this.audit.log(
          {
            companyId: id,
            userId: user.id,
            action: 'OPENING',
            entity: 'Company',
            entityId: id,
            description: `Abertura concluída: capital de ${capitalAmount.toFixed(2)}, período ${dto.period.name}.`,
          },
          tx,
        );

        return { period, capitalEntry, patrimonyEntry, extraEntry };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
    );

    return {
      message: 'Abertura empresarial concluída com sucesso.',
      ...result,
    };
  }

  async members(user: AuthUser, id: string) {
    const { isOwner } = await this.resolveAccess(user, id);
    if (!isOwner && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Apenas o responsável pela empresa pode gerenciar acessos.');
    }
    const members = await this.prisma.companyMember.findMany({
      where: { companyId: id },
      include: { user: { select: { id: true, name: true, email: true } }, role: true },
    });
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: { owner: { select: { id: true, name: true, email: true } } },
    });
    return { owner: company?.owner, members };
  }

  async addMember(user: AuthUser, id: string, dto: AddMemberDto) {
    const { isOwner } = await this.resolveAccess(user, id);
    if (!isOwner && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Apenas o responsável pela empresa pode gerenciar acessos.');
    }
    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('Nenhum usuário cadastrado com este e-mail.');
    if (target.role.name === RoleName.ALUNO) {
      throw new BadRequestException(
        'Somente usuários com perfil Professor ou Administrador podem receber acesso de consulta.',
      );
    }
    const existing = await this.prisma.companyMember.findFirst({
      where: { companyId: id, userId: target.id },
    });
    if (existing) throw new ConflictException('Este usuário já possui acesso à empresa.');

    const professorRole = await this.prisma.role.findUnique({ where: { name: RoleName.PROFESSOR } });
    await this.prisma.companyMember.create({
      data: { companyId: id, userId: target.id, roleId: professorRole?.id },
    });
    await this.audit.log({
      companyId: id,
      userId: user.id,
      action: 'SHARE',
      entity: 'CompanyMember',
      entityId: target.id,
      description: `Acesso de consulta concedido a ${target.name}.`,
    });
    return { message: 'Acesso concedido com sucesso.' };
  }

  async removeMember(user: AuthUser, id: string, memberId: string) {
    const { isOwner } = await this.resolveAccess(user, id);
    if (!isOwner && user.role !== RoleName.ADMIN) {
      throw new ForbiddenException('Apenas o responsável pela empresa pode gerenciar acessos.');
    }
    const member = await this.prisma.companyMember.findFirst({ where: { id: memberId, companyId: id } });
    if (!member) throw new NotFoundException('Vínculo não encontrado.');
    if (member.userId === user.id) {
      throw new BadRequestException('Você não pode remover o seu próprio acesso.');
    }
    await this.prisma.companyMember.delete({ where: { id: memberId } });
    return { message: 'Acesso removido.' };
  }

  async activity(companyId: string, limit = 8) {
    const [entries, movements] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: { companyId },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        take: limit,
        include: { createdBy: { select: { name: true } } },
      }),
      this.prisma.stockMovement.findMany({
        where: { companyId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        include: { product: { select: { name: true, unit: true } } },
      }),
    ]);
    return { entries, movements };
  }
}
