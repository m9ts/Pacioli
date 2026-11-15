import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private async roleId(name: RoleName) {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) throw new BadRequestException('Perfis de acesso não configurados. Execute o seed do banco.');
    return role.id;
  }

  private async sign(user: { id: string; email: string; role: RoleName }) {
    return this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
  }

  private publicUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role?.name ?? user.role,
      roleLabel:
        user.role?.label ??
        ({ ADMIN: 'Administrador', PROFESSOR: 'Professor', ALUNO: 'Aluno' } as const)[
          (user.role?.name ?? user.role) as RoleName
        ],
      createdAt: user.createdAt,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Já existe uma conta com este e-mail.');

    let role: RoleName = RoleName.ALUNO;
    if (dto.role === 'PROFESSOR') {
      const expected = this.config.get<string>('TEACHER_INVITE_CODE', 'PACIOLI-PROF-2026');
      if (!dto.teacherCode || dto.teacherCode.trim().toUpperCase() !== expected.toUpperCase()) {
        throw new BadRequestException(
          'Código de convite de professor inválido. Solicite o código à coordenação do curso.',
        );
      }
      role = RoleName.PROFESSOR;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email,
        passwordHash,
        roleId: await this.roleId(role),
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      description: `Conta criada com o perfil ${user.role.label}.`,
    });

    const accessToken = await this.sign({ id: user.id, email: user.email, role });
    return { accessToken, user: this.publicUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('E-mail ou senha inválidos.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('E-mail ou senha inválidos.');

    const accessToken = await this.sign({ id: user.id, email: user.email, role: user.role.name });
    return { accessToken, user: this.publicUser(user) };
  }

  /**
   * Sessão de demonstração: cria uma conta descartável de visitante para que a
   * página inicial possa explorar o sistema sem cadastro prévio.
   */
  async guest() {
    const email = `visitante-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}@visitante.pacioli.local`;
    const user = await this.prisma.user.create({
      data: {
        name: 'Visitante',
        email,
        passwordHash: await bcrypt.hash(randomUUID(), 10),
        roleId: await this.roleId(RoleName.ALUNO),
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      description: 'Sessão de visitante criada pela página inicial.',
    });

    const accessToken = await this.sign({ id: user.id, email: user.email, role: RoleName.ALUNO });
    return { accessToken, user: this.publicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        companies: { orderBy: { createdAt: 'asc' } },
        memberships: { include: { company: true, role: true } },
      },
    });
    if (!user) throw new UnauthorizedException('Usuário não encontrado.');
    return {
      user: this.publicUser(user),
      companies: this.mapCompanies(user),
    };
  }

  private mapCompanies(user: any) {
    const owned = (user.companies ?? []).map((company: any) => ({
      ...company,
      accessRole: user.role.name === RoleName.ADMIN ? RoleName.ADMIN : RoleName.ALUNO,
      isOwner: true,
    }));
    const shared = (user.memberships ?? [])
      .filter((membership: any) => membership.company)
      .map((membership: any) => ({
        ...membership.company,
        accessRole: membership.role?.name ?? RoleName.PROFESSOR,
        isOwner: membership.company.ownerId === user.id,
      }));
    const seen = new Set<string>();
    return [...owned, ...shared].filter((company: any) => {
      if (seen.has(company.id)) return false;
      seen.add(company.id);
      return true;
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: userId } },
      });
      if (existing) throw new ConflictException('Este e-mail já está em uso por outra conta.');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.email ? { email: dto.email } : {}),
      },
      include: { role: true },
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      description: 'Dados do perfil atualizados.',
    });
    return this.publicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário não encontrado.');
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('A senha atual informada está incorreta.');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('A nova senha deve ser diferente da senha atual.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    await this.audit.log({
      userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: userId,
      description: 'Senha alterada pelo usuário.',
    });
    return { message: 'Senha alterada com sucesso.' };
  }
}
