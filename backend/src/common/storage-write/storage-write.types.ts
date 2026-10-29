import type { Prisma } from '../../generated/prisma/client';

export interface StagedStorageAdapter {
  stage(stagingKey: string, contents: Buffer): Promise<void>;
  promote(stagingKey: string, finalKey: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type StorageWriteResult<T> = Readonly<{
  id: string;
  finalKey: string;
  status: 'READY' | 'PENDING_PROMOTION';
  value: T | null;
  replayed: boolean;
}>;

export type StorageBusinessCommit<T> = (
  transaction: Prisma.TransactionClient,
  intent: Readonly<{ id: string; finalKey: string; contentHash: string; sizeBytes: number }>,
) => Promise<T>;
