import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { WorkerModule } from './worker.module';

export async function createWorkerApplication(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(WorkerModule, {
    abortOnError: true,
  });
}
