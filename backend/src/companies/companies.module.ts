import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { ImportOpeningService } from './import-opening.service';
import { AccountsModule } from '../accounts/accounts.module';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [AccountsModule, JournalModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, ImportOpeningService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
