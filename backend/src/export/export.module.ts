import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ReportsModule } from '../reports/reports.module';
import { JournalModule } from '../journal/journal.module';
import { AssetsModule } from '../assets/assets.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [ReportsModule, JournalModule, AssetsModule, StockModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
