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
};

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
