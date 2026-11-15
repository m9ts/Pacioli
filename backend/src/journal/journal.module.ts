import { Module } from '@nestjs/common';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService, AuditModule],
})
export class JournalModule {}
