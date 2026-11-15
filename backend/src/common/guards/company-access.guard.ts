import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CompanyContext } from '../decorators';

/**
 * Valida o acesso do usuário à empresa informada no cabeçalho `x-company-id`
 * e garante o isolamento dos dados entre empresas.
 */
@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    const companyId = (request.headers['x-company-id'] as string | undefined)?.trim();

    if (!companyId) {
      throw new BadRequestException(
        'Selecione uma empresa para continuar (cabeçalho x-company-id ausente).',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        members: { where: { userId: user.id }, include: { role: true } },
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const isOwner = company.ownerId === user.id;
    const membership = company.members[0];

    let accessRole: RoleName | null = null;
    if (user.role === RoleName.ADMIN) accessRole = RoleName.ADMIN;
    else if (isOwner) accessRole = RoleName.ALUNO;
    else if (membership) accessRole = membership.role?.name ?? RoleName.ALUNO;

    if (!accessRole) {
      throw new ForbiddenException('Você não tem acesso aos dados desta empresa.');
    }

    const canWrite = accessRole !== RoleName.PROFESSOR;
    const method = request.method?.toUpperCase();
    const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

    if (!canWrite && !isRead) {
      throw new ForbiddenException(
        'Perfil de professor possui acesso somente para consulta nesta empresa.',
      );
    }

    const contextCompany: CompanyContext = {
      id: company.id,
      ownerId: company.ownerId,
      legalName: company.legalName,
      tradeName: company.tradeName,
      status: company.status,
      accessRole,
      canWrite,
    };

    request.company = contextCompany;
    request.companyId = company.id;
    return true;
  }
}
