import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JournalService } from './journal.service';
import { CreateJournalEntryDto, ListJournalDto, ReverseEntryDto } from './dto/journal.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { AuthUser, CompanyId, CurrentUser } from '../common/decorators';

@ApiTags('Livro Diário')
@ApiBearerAuth()
@Controller('journal')
@UseGuards(CompanyAccessGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  list(@CompanyId() companyId: string, @Query() query: ListJournalDto) {
    return this.journal.list(companyId, query);
  }

  @Get(':id')
  findOne(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.journal.findOne(companyId, id);
  }

  @Post()
  create(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.journal.createManual(companyId, user.id, dto);
  }

  @Post(':id/reverse')
  reverse(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReverseEntryDto,
  ) {
    return this.journal.reverse(companyId, user.id, id, dto.reason, dto.date);
  }

  @Delete(':id')
  remove() {
    return this.journal.remove();
  }
}
