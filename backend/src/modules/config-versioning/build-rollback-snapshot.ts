import type { ConfigSnapshot } from './config-versioning.types';

export function buildRollbackSnapshot(
  previous: ConfigSnapshot,
  previousVersion: number,
  capturedAt: string,
): ConfigSnapshot {
  return {
    ...previous,
    capturedAt,
    rollbackOfVersion: previousVersion,
  };
}
