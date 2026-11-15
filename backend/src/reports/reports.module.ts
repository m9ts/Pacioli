import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BalancesService } from './balances.service';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [JournalModule],
  controllers: [ReportsController],
  providers: [ReportsService, BalancesService],
  exports: [ReportsService, BalancesService],
})
export class ReportsModule {}
