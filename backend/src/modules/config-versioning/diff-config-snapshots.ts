import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import { changeLogActions } from '../change-log/change-log.constants';
import type { ChangeLogDiffPayload, JsonValue } from '../change-log/change-log.types';
import type { ConfigSnapshot } from './config-versioning.types';

export function diffConfigSnapshots(
  before: ConfigSnapshot,
  after: ConfigSnapshot,
): ChangeLogDiffPayload {
  return buildChangeLogDiff({
    action: changeLogActions.update,
    resourceType: 'config_version',
    resourceId: `${before.schemaVersion}:${after.schemaVersion}`,
    before: before as unknown as JsonValue,
    after: after as unknown as JsonValue,
  });
}
