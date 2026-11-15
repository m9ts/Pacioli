import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { PeriodsModule } from './periods/periods.module';
import { AccountsModule } from './accounts/accounts.module';
import { JournalModule } from './journal/journal.module';
import { ReportsModule } from './reports/reports.module';
import { StockModule } from './stock/stock.module';
import { AssetsModule } from './assets/assets.module';
import { PartnersModule } from './partners/partners.module';
import { ExportModule } from './export/export.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CompaniesModule,
    PeriodsModule,
    AccountsModule,
    JournalModule,
    ReportsModule,
    StockModule,
    AssetsModule,
    PartnersModule,
    ExportModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
