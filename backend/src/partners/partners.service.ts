import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(kind: 'customer' | 'supplier'): Prisma.CustomerDelegate | Prisma.SupplierDelegate {
    return (kind === 'customer' ? this.prisma.customer : this.prisma.supplier) as any;
  }

  async list(companyId: string, kind: 'customer' | 'supplier', search?: string) {
    const delegate = this.delegate(kind) as any;
    return delegate.findMany({
      where: {
        companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { document: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(companyId: string, kind: 'customer' | 'supplier', dto: CreatePartnerDto) {
    const delegate = this.delegate(kind) as any;
    const duplicate = await delegate.findFirst({
      where: { companyId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (duplicate) {
      throw new BadRequestException('Já existe um cadastro com este nome.');
    }
    return delegate.create({
      data: {
        companyId,
        name: dto.name.trim(),
        document: dto.document,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
      },
    });
  }

  async update(companyId: string, kind: 'customer' | 'supplier', id: string, dto: UpdatePartnerDto) {
    const delegate = this.delegate(kind) as any;
    const existing = await delegate.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Cadastro não encontrado.');
    return delegate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.document !== undefined ? { document: dto.document } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.active !== undefined ? { active: dto.active === 'true' || dto.active === true } : {}),
      },
    });
  }

  async remove(companyId: string, kind: 'customer' | 'supplier', id: string) {
    const delegate = this.delegate(kind) as any;
    const existing = await delegate.findFirst({
      where: { id, companyId },
      include: { _count: { select: { movements: true } } },
    });
    if (!existing) throw new NotFoundException('Cadastro não encontrado.');
    if (existing._count.movements > 0) {
      throw new BadRequestException(
        'Este cadastro possui movimentações vinculadas e não pode ser excluído.',
      );
    }
    await delegate.delete({ where: { id } });
    return { message: 'Cadastro excluído.' };
  }
}
