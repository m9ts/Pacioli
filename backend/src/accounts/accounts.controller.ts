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
import { AccountsService } from './accounts.service';
import { CreateAccountDto, ListAccountsDto, UpdateAccountDto } from './dto/account.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { CompanyId } from '../common/decorators';

@ApiTags('Plano de contas')
@ApiBearerAuth()
@Controller('accounts')
@UseGuards(CompanyAccessGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CompanyId() companyId: string, @Query() query: ListAccountsDto) {
    return this.accounts.list(companyId, query);
  }

  @Get('tree')
  tree(@CompanyId() companyId: string) {
    return this.accounts.tree(companyId);
  }

  @Get('entry-options')
  entryOptions(@CompanyId() companyId: string) {
    return this.accounts.entryOptions(companyId);
  }

  /** Alias usado pelo front-end (mesmo payload de entry-options). */
  @Get('options')
  options(@CompanyId() companyId: string) {
    return this.accounts.entryOptions(companyId);
  }

  @Get(':id')
  findOne(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.accounts.findOne(companyId, id);
  }

  @Post()
  create(@CompanyId() companyId: string, @Body() dto: CreateAccountDto) {
    return this.accounts.create(companyId, dto);
  }

  @Patch(':id')
  update(@CompanyId() companyId: string, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(companyId, id, dto);
  }

  @Delete(':id')
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.accounts.remove(companyId, id);
  }
}
