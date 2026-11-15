import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PeriodsService } from './periods.service';
import { CreatePeriodDto, UpdatePeriodDto } from './dto/period.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { CompanyId } from '../common/decorators';

@ApiTags('Períodos contábeis')
@ApiBearerAuth()
@Controller('periods')
@UseGuards(CompanyAccessGuard)
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  list(@CompanyId() companyId: string) {
    return this.periods.list(companyId);
  }

  @Post()
  create(@CompanyId() companyId: string, @Body() dto: CreatePeriodDto) {
    return this.periods.create(companyId, dto);
  }

  @Patch(':id')
  update(@CompanyId() companyId: string, @Param('id') id: string, @Body() dto: UpdatePeriodDto) {
    return this.periods.update(companyId, id, dto);
  }

  @Delete(':id')
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.periods.remove(companyId, id);
  }
}
