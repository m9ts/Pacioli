import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type TransactionOptions = Parameters<PrismaClient['$transaction']>[1];

/** Default de timeout das transações interativas.
 * O padrão do Prisma (5 s) estoura contra bancos remotos — ex.: API no Render
 * (Oregon) falando com o Neon (São Paulo), onde cada comando custa ~100-200 ms
 * e transações com dezenas de operações passam facilmente de 5 s
 * ("Transaction not found"). Aplicativos que passam opções próprias
 * (ex.: isolationLevel) continuam funcionando: elas têm precedência. */
const TRANSACTION_DEFAULTS: TransactionOptions = {
  timeout: 60_000,
  maxWait: 10_000,
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly rawTransaction: PrismaClient['$transaction'];

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    this.rawTransaction = this.$transaction.bind(this);
    // Envolve $transaction para aplicar o default de timeout em todas as transações.
    this.$transaction = ((arg: any, options?: TransactionOptions) =>
      this.rawTransaction(arg as any, { ...TRANSACTION_DEFAULTS, ...(options ?? {}) })) as any;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
