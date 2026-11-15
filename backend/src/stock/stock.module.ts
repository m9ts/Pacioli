import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { ProductsService } from './products.service';
import { StockService } from './stock.service';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [JournalModule],
  controllers: [StockController],
  providers: [ProductsService, StockService],
  exports: [StockService, ProductsService],
})
export class StockModule {}
