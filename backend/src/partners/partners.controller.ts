import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PartnersService } from './partners.service';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { CompanyId } from '../common/decorators';

@ApiTags('Clientes e Fornecedores')
@ApiBearerAuth()
@Controller('partners')
@UseGuards(CompanyAccessGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get(':kind')
  list(
    @CompanyId() companyId: string,
    @Param('kind') kind: 'customer' | 'supplier',
    @Query('search') search?: string,
  ) {
    return this.partners.list(companyId, kind, search);
  }

  @Post(':kind')
  create(
    @CompanyId() companyId: string,
    @Param('kind') kind: 'customer' | 'supplier',
    @Body() dto: CreatePartnerDto,
  ) {
    return this.partners.create(companyId, kind, dto);
  }

  @Patch(':kind/:id')
  update(
    @CompanyId() companyId: string,
    @Param('kind') kind: 'customer' | 'supplier',
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partners.update(companyId, kind, id, dto);
  }

  @Delete(':kind/:id')
  remove(
    @CompanyId() companyId: string,
    @Param('kind') kind: 'customer' | 'supplier',
    @Param('id') id: string,
  ) {
    return this.partners.remove(companyId, kind, id);
  }
}
