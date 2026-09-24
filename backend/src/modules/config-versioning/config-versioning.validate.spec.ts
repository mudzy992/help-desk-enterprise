import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { applicationSettings } from '../settings/definitions/application-settings';
import { buildRollbackSnapshot } from './build-rollback-snapshot';
import { configVersioningScopes } from './config-versioning.constants';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import { createConfigSnapshotFixture } from './create-config-snapshot-fixture';
import { diffConfigSnapshots } from './diff-config-snapshots';
import { assertConfigActivationAllowed } from './config-versioning-access';
import { validateConfigSnapshot } from './validate-config-snapshot';
import type { ConfigVersioningConfiguration } from './config-versioning.types';

const registry = createSettingsRegistry(applicationSettings);

const configuration = (
  scopes: readonly string[],
): ConfigVersioningConfiguration => ({
  enabled: true,
  allowRollback: true,
  validationEnabled: true,
  blockActivationOnError: true,
  shadowModeEnabled: true,
  scopes,
});

describe('validateConfigSnapshot', () => {
  it('returns routing coverage errors that block activation', () => {
    const snapshot = createConfigSnapshotFixture({
      routing: {
        configuration: {
          unroutedQueueEnabled: false,
          unroutedQueueOwnerRole: 'SUPER_ADMIN',
          requireCoverage: true,
        },
        rules: [],
      },
    });
    const errors = validateConfigSnapshot(
      snapshot,
      registry,
      configuration([configVersioningScopes.routing]),
    );
    expect(errors.some((issue) => issue.code === 'ROUTING_UNCOVERED')).toBe(
      true,
    );
    expect(() =>
      assertConfigActivationAllowed(
        snapshot,
        registry,
        configuration([configVersioningScopes.routing]),
      ),
    ).toThrow(ConfigVersioningError);
    try {
      assertConfigActivationAllowed(
        snapshot,
        registry,
        configuration([configVersioningScopes.routing]),
      );
    } catch (error) {
      expect(error).toMatchObject({
        code: configVersioningErrorCodes.validationFailed,
      });
      expect(
        (error as ConfigVersioningError).details?.some(
          (issue) => issue.code === 'ROUTING_UNCOVERED',
        ),
      ).toBe(true);
    }
  });

  it('flags incomplete SLA priority coverage', () => {
    const base = createConfigSnapshotFixture();
    const snapshot = createConfigSnapshotFixture({
      sla: {
        ...base.sla,
        rules: base.sla.rules.filter((rule) => rule.priority !== 'CRITICAL'),
      },
    });
    const errors = validateConfigSnapshot(
      snapshot,
      registry,
      configuration([configVersioningScopes.sla]),
    );
    expect(
      errors.some((issue) => issue.code === 'SLA_PRIORITY_INCOMPLETE'),
    ).toBe(true);
  });
});

describe('diffConfigSnapshots', () => {
  it('reuses the deterministic change-log diff for snapshot JSON', () => {
    const before = createConfigSnapshotFixture();
    const after = createConfigSnapshotFixture({
      routing: {
        ...before.routing,
        rules: [
          {
            id: 'rule-1',
            originUnitId: 'ou-root',
            serviceId: 'service-vpn',
            groupId: 'group-hr',
          },
        ],
      },
    });
    const diff = diffConfigSnapshots(before, after);
    expect(diff.changes.some((entry) => entry.path.includes('groupId'))).toBe(
      true,
    );
  });
});

describe('buildRollbackSnapshot', () => {
  it('copies the previous snapshot and records rollbackOfVersion', () => {
    const previous = createConfigSnapshotFixture();
    const rolled = buildRollbackSnapshot(previous, 3, '2026-09-14T09:00:00.000Z');
    expect(rolled.rollbackOfVersion).toBe(3);
    expect(rolled.routing).toEqual(previous.routing);
    expect(rolled.capturedAt).toBe('2026-09-14T09:00:00.000Z');
  });
});
