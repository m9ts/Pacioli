import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { endOfDay, startOfDay, toISODate } from '../common/utils/date';
import { CreatePeriodDto, UpdatePeriodDto } from './dto/period.dto';

@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.accountingPeriod.findMany({
      where: { companyId },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { entries: true } } },
    });
  }

  private async assertNoOverlap(
    companyId: string,
    start: Date,
    end: Date,
    ignoreId?: string,
  ) {
    const overlapping = await this.prisma.accountingPeriod.findFirst({
      where: {
        companyId,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        `O período se sobrepõe ao período "${overlapping.name}" (${toISODate(overlapping.startDate)} a ${toISODate(overlapping.endDate)}).`,
      );
    }
  }

  async create(companyId: string, dto: CreatePeriodDto) {
    const start = startOfDay(dto.startDate);
    const end = endOfDay(dto.endDate);
    if (start > end) throw new BadRequestException('A data inicial deve ser anterior à data final.');
    await this.assertNoOverlap(companyId, start, end);
    return this.prisma.accountingPeriod.create({
      data: { companyId, name: dto.name, startDate: start, endDate: end, status: PeriodStatus.OPEN },
    });
  }

  async update(companyId: string, id: string, dto: UpdatePeriodDto) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, companyId },
      include: { _count: { select: { entries: true } } },
    });
    if (!period) throw new NotFoundException('Período contábil não encontrado.');

    const start = dto.startDate ? startOfDay(dto.startDate) : period.startDate;
    const end = dto.endDate ? endOfDay(dto.endDate) : period.endDate;
    if (start > end) throw new BadRequestException('A data inicial deve ser anterior à data final.');

    if (period._count.entries > 0 && (dto.startDate || dto.endDate)) {
      throw new BadRequestException(
        'Este período já possui lançamentos. As datas não podem ser alteradas.',
      );
    }
    await this.assertNoOverlap(companyId, start, end, id);

    return this.prisma.accountingPeriod.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.startDate ? { startDate: start } : {}),
        ...(dto.endDate ? { endDate: end } : {}),
      },
    });
  }

  async remove(companyId: string, id: string) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, companyId },
      include: { _count: { select: { entries: true } } },
    });
    if (!period) throw new NotFoundException('Período contábil não encontrado.');
    if (period.status === PeriodStatus.CLOSED) {
      throw new BadRequestException('Períodos encerrados não podem ser excluídos.');
    }
    if (period._count.entries > 0) {
      throw new BadRequestException(
        'Este período possui lançamentos e não pode ser excluído.',
      );
    }
    await this.prisma.accountingPeriod.delete({ where: { id } });
    return { message: 'Período excluído.' };
  }
}
