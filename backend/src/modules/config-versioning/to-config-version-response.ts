import type { ConfigVersionStatus } from '../../generated/prisma/enums';
import type {
  ConfigSnapshot,
  ConfigVersionDetailResponse,
  ConfigVersionResponse,
} from './config-versioning.types';

export type ConfigVersionRecord = {
  readonly id: string;
  readonly version: number;
  readonly status: ConfigVersionStatus;
  readonly snapshot: unknown;
  readonly releaseNotes: string | null;
  readonly createdByUserId: string | null;
  readonly activatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly importMeta?: unknown;
};

function readImportedFrom(value: unknown): ConfigVersionResponse['importedFrom'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const meta = value as Record<string, unknown>;
  return {
    sourceEnvironment: typeof meta.sourceEnvironment === 'string' ? meta.sourceEnvironment : '',
    sourceVersion: typeof meta.sourceVersion === 'number' ? meta.sourceVersion : 0,
    exportedAt: typeof meta.exportedAt === 'string' ? meta.exportedAt : '',
    signature: typeof meta.signature === 'string' ? meta.signature : 'unsigned',
  };
}

export function toConfigVersionResponse(
  record: ConfigVersionRecord,
  snapshot: ConfigSnapshot,
): ConfigVersionResponse {
  return {
    id: record.id,
    version: record.version,
    status: record.status,
    releaseNotes: record.releaseNotes,
    createdByUserId: record.createdByUserId,
    activatedAt: record.activatedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    rollbackOfVersion: snapshot.rollbackOfVersion,
    importedFrom: readImportedFrom(record.importMeta),
  };
}

export function toConfigVersionDetailResponse(
  record: ConfigVersionRecord,
  snapshot: ConfigSnapshot,
): ConfigVersionDetailResponse {
  return {
    ...toConfigVersionResponse(record, snapshot),
    snapshot,
  };
}
