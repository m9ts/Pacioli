import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  BalanceSheetQueryDto,
  ClosingDto,
  DreQueryDto,
  LedgerQueryDto,
  PeriodQueryDto,
} from './dto/report.dto';
import { CompanyAccessGuard } from '../common/guards/company-access.guard';
import { AuthUser, CompanyId, CurrentUser } from '../common/decorators';

@ApiTags('Relatórios contábeis')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(CompanyAccessGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('trial-balance')
  trialBalance(@CompanyId() companyId: string, @Query() query: PeriodQueryDto) {
    return this.reports.trialBalance(companyId, query);
  }

  @Get('balance-sheet')
  balanceSheet(@CompanyId() companyId: string, @Query() query: BalanceSheetQueryDto) {
    return this.reports.balanceSheet(companyId, query);
  }

  @Get('dre')
  dre(@CompanyId() companyId: string, @Query() query: DreQueryDto) {
    return this.reports.dre(companyId, query);
  }

  @Get('ledger')
  ledger(@CompanyId() companyId: string, @Query() query: LedgerQueryDto) {
    return this.reports.ledger(companyId, query);
  }

  @Get('dashboard')
  dashboard(@CompanyId() companyId: string, @Query('date') date?: string) {
    return this.reports.dashboard(companyId, date);
  }

  @Get('closing/preview')
  closingPreview(@CompanyId() companyId: string, @Query('periodId') periodId: string) {
    return this.reports.closingPreview(companyId, periodId);
  }

  @Post('closing')
  closePeriod(
    @CompanyId() companyId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ClosingDto,
  ) {
    return this.reports.closePeriod(companyId, user.id, dto);
  }
}
