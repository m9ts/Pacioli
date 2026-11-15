import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser, Company, CompanyContext, CurrentUser } from '../common/decorators';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';

@ApiTags('Auditoria')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(RolesGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(CompanyAccessGuard)
  async list(@Company() company: CompanyContext, @Query('limit') limit = '100') {
    return this.prisma.auditLog.findMany({
      where: { companyId: company.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 300),
    });
  }

  @Get('system')
  @Roles(RoleName.ADMIN)
  async system(@CurrentUser() user: AuthUser) {
    return this.prisma.auditLog.findMany({
      where: { companyId: null },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
