import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCommandItemError, BulkCommandValidationError, bulkCommandErrorCodes } from './bulk-command.error';

const itemKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const maximumItems = 100;
const atomicTransactionTimeoutMs = 30_000;

export type BulkCommandMode = 'atomic' | 'best-effort';
export type BulkCommandItem<Payload> = Readonly<{ key: string; payload: Payload }>;

export type BulkItemResult<Value> =
  | Readonly<{ key: string; status: 'SUCCEEDED'; value: Value }>
  | Readonly<{ key: string; status: 'FAILED'; error: { code: string; message: string; retryable: boolean } }>
  | Readonly<{ key: string; status: 'ROLLED_BACK' }>
  | Readonly<{ key: string; status: 'SKIPPED' }>;

export type BulkCommandResult<Value> = Readonly<{
  mode: BulkCommandMode;
  outcome: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  committed: boolean;
  total: number;
  succeeded: number;
  failed: number;
  rolledBack: number;
  skipped: number;
  results: readonly BulkItemResult<Value>[];
}>;

type AtomicAbort = Readonly<{ marker: 'BULK_ATOMIC_ABORT'; failedIndex: number; error: unknown }>;

@Injectable()
export class BulkCommandService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<Payload, Value>(input: {
    readonly mode: BulkCommandMode;
    readonly items: readonly BulkCommandItem<Payload>[];
    readonly handle: (item: BulkCommandItem<Payload>, transaction: Prisma.TransactionClient) => Promise<Value>;
  }): Promise<BulkCommandResult<Value>> {
    validateRequest(input.mode, input.items);
    return input.mode === 'atomic' ? this.executeAtomic(input.items, input.handle) : this.executeBestEffort(input.items, input.handle);
  }

  private async executeAtomic<Payload, Value>(
    items: readonly BulkCommandItem<Payload>[],
    handle: (item: BulkCommandItem<Payload>, transaction: Prisma.TransactionClient) => Promise<Value>,
  ): Promise<BulkCommandResult<Value>> {
    const successfulValues: Value[] = [];
    try {
      await this.prisma.$transaction(async (transaction) => {
        for (let index = 0; index < items.length; index += 1) {
          try {
            successfulValues.push(await handle(items[index]!, transaction));
          } catch (error) {
            throw { marker: 'BULK_ATOMIC_ABORT', failedIndex: index, error } satisfies AtomicAbort;
          }
        }
      }, { timeout: atomicTransactionTimeoutMs });
      const results = items.map((item, index) => ({ key: item.key, status: 'SUCCEEDED' as const, value: successfulValues[index]! }));
      return summary('atomic', true, results);
    } catch (error) {
      if (!isAtomicAbort(error)) throw error;
      const results: BulkItemResult<Value>[] = items.map((item, index) => {
        if (index < error.failedIndex) return { key: item.key, status: 'ROLLED_BACK' };
        if (index > error.failedIndex) return { key: item.key, status: 'SKIPPED' };
        return { key: item.key, status: 'FAILED', error: normalizeItemError(error.error) };
      });
      return summary('atomic', false, results);
    }
  }

  private async executeBestEffort<Payload, Value>(
    items: readonly BulkCommandItem<Payload>[],
    handle: (item: BulkCommandItem<Payload>, transaction: Prisma.TransactionClient) => Promise<Value>,
  ): Promise<BulkCommandResult<Value>> {
    const results: BulkItemResult<Value>[] = [];
    // Sequential transactions are intentional: bounded input must not become a connection-pool burst.
    for (const item of items) {
      try {
        const value = await this.prisma.$transaction((transaction) => handle(item, transaction), {
          timeout: atomicTransactionTimeoutMs,
        });
        results.push({ key: item.key, status: 'SUCCEEDED', value });
      } catch (error) {
        results.push({ key: item.key, status: 'FAILED', error: normalizeItemError(error) });
      }
    }
    return summary('best-effort', true, results);
  }
}

function validateRequest<Payload>(mode: string, items: readonly BulkCommandItem<Payload>[]): void {
  if ((mode !== 'atomic' && mode !== 'best-effort') || items.length < 1 || items.length > maximumItems) {
    throw new BulkCommandValidationError();
  }
  const keys = new Set<string>();
  for (const item of items) {
    if (!itemKeyPattern.test(item.key) || keys.has(item.key)) throw new BulkCommandValidationError();
    keys.add(item.key);
  }
}

function normalizeItemError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof BulkCommandItemError && /^[A-Z][A-Z0-9_]{2,79}$/u.test(error.code)) {
    return { code: error.code, message: error.message.slice(0, 500), retryable: error.retryable };
  }
  return { code: bulkCommandErrorCodes.internalFailure, message: bulkCommandErrorCodes.internalFailure, retryable: false };
}

function isAtomicAbort(error: unknown): error is AtomicAbort {
  return typeof error === 'object' && error !== null && 'marker' in error && error.marker === 'BULK_ATOMIC_ABORT' &&
    'failedIndex' in error && typeof error.failedIndex === 'number' && 'error' in error;
}

function summary<Value>(mode: BulkCommandMode, committed: boolean, results: readonly BulkItemResult<Value>[]): BulkCommandResult<Value> {
  const succeeded = results.filter(({ status }) => status === 'SUCCEEDED').length;
  const failed = results.filter(({ status }) => status === 'FAILED').length;
  const rolledBack = results.filter(({ status }) => status === 'ROLLED_BACK').length;
  const skipped = results.filter(({ status }) => status === 'SKIPPED').length;
  const outcome = failed === 0 ? 'SUCCEEDED' : succeeded === 0 ? 'FAILED' : 'PARTIAL';
  return { mode, outcome, committed, total: results.length, succeeded, failed, rolledBack, skipped, results };
}
