import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { buildRollbackSnapshot } from './build-rollback-snapshot';
import { configVersioningScopes } from './config-versioning.constants';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import { createConfigSnapshotFixture } from './create-config-snapshot-fixture';
import { diffConfigSnapshots } from './diff-config-snapshots';
import { assertConfigActivationAllowed } from './config-versioning-access';
import { validateConfigSnapshot } from './validate-config-snapshot';
import type { ConfigVersioningConfiguration } from './config-versioning.types';

const registry = createSettingsRegistry([]);

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

describe('mandatory catalog validation', () => {
  it('blocks routing coverage failures even when configurable validation is disabled', () => {
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
    const permissive = {
      ...configuration([]),
      validationEnabled: false,
      blockActivationOnError: false,
    };

    expect(validateConfigSnapshot(snapshot, registry, permissive)).toContainEqual(
      expect.objectContaining({ code: 'ROUTING_UNCOVERED' }),
    );
    expect(() =>
      assertConfigActivationAllowed(snapshot, registry, permissive),
    ).toThrow(ConfigVersioningError);
  });

  it('blocks invalid form lifecycle state even when configurable validation is disabled', () => {
    const base = createConfigSnapshotFixture();
    const activeForm = base.forms.versions[0]!;
    const snapshot = createConfigSnapshotFixture({
      forms: {
        versions: [
          activeForm,
          { ...activeForm, id: 'form-vpn-2', version: 2 },
        ],
      },
    });
    const permissive = {
      ...configuration([]),
      validationEnabled: false,
      blockActivationOnError: false,
    };

    expect(validateConfigSnapshot(snapshot, registry, permissive)).toContainEqual(
      expect.objectContaining({ code: 'MULTIPLE_ACTIVE_FORM_VERSIONS' }),
    );
    expect(() =>
      assertConfigActivationAllowed(snapshot, registry, permissive),
    ).toThrow(ConfigVersioningError);
    try {
      assertConfigActivationAllowed(snapshot, registry, permissive);
    } catch (error) {
      expect(error).toMatchObject({
        code: configVersioningErrorCodes.validationFailed,
      });
    }
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

  it('keeps live catalog rows missing from the historical target and rebases its hash', () => {
    const previous = createConfigSnapshotFixture();
    const current = createConfigSnapshotFixture({
      catalogStateHash: 'a'.repeat(64),
      catalog: {
        services: [
          ...previous.catalog.services,
          { ...previous.catalog.services[0]!, id: 'service-new', slug: 'new' },
        ],
      },
      forms: {
        versions: [
          ...previous.forms.versions,
          {
            ...previous.forms.versions[0]!,
            id: 'form-new',
            serviceId: 'service-new',
          },
        ],
      },
    });
    const historical = createConfigSnapshotFixture({
      catalog: {
        services: [
          { ...previous.catalog.services[0]!, name: 'Historical VPN' },
        ],
      },
    });

    const rolled = buildRollbackSnapshot(
      historical,
      3,
      '2026-09-14T09:00:00.000Z',
      current,
    );

    expect(rolled.catalog.services).toEqual([
      ...historical.catalog.services,
      current.catalog.services[1],
    ]);
    expect(rolled.catalog.services[0]?.name).toBe('Historical VPN');
    expect(rolled.forms.versions).toEqual(current.forms.versions);
    expect(rolled.catalogStateHash).toBe(current.catalogStateHash);
  });
});
