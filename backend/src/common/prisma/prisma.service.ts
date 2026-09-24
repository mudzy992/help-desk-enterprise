import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { createInstrumentedPool } from '../database/create-instrumented-pool';
import {
  loadDatabasePoolConfiguration,
  readDatabasePoolRole,
  toDatabasePoolConfig,
} from '../database/load-database-pool-configuration';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    // The pool is created here (instead of letting the adapter build one) so it
    // can be sized and timed out explicitly (plan §1.4) and so every statement
    // can be counted for the `db_queries_per_request` metric (plan §5.3).
    const poolConfiguration = loadDatabasePoolConfiguration(
      process.env,
      readDatabasePoolRole(process.env),
    );
    super({
      adapter: new PrismaPg(
        createInstrumentedPool(
          toDatabasePoolConfig(connectionString, poolConfiguration),
        ),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
