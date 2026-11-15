import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
}

export interface CompanyContext {
  id: string;
  ownerId: string;
  legalName: string;
  tradeName: string;
  status: string;
  accessRole: RoleName;
  canWrite: boolean;
}

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

export const Company = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CompanyContext => ctx.switchToHttp().getRequest().company,
);

export const CompanyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().companyId,
);
