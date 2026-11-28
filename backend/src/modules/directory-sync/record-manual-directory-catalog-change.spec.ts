import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { appendAuditLog } from '../audit-log/append-audit-log';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordManualDirectoryCatalogChange } from './record-manual-directory-catalog-change';

/**
 * W2.35b regression: these tests use the **real** policy and the **real** append
 * path. The previous unit tests mocked the audit helper, so nothing exercised
 * `prepareAuditEntry` — and production returned 500 for
 * `AUDIT_SCOPE_REQUIRED:organizational_unit.created` when a SuperAdmin created an
 * OU from the directory screen. A mocked audit boundary is not a passing test.
 */
type CapturedRow = {
  readonly action?: unknown;
  readonly entityType?: unknown;
  readonly entityId?: unknown;
  readonly organizationalUnitId?: unknown;
  readonly chainPartition?: unknown;
  readonly metadata?: unknown;
};

function createAuditClient(): {
  readonly client: AuditLogWriteClient;
  readonly rows: CapturedRow[];
  readonly advisoryLocks: unknown[];
} {
  const rows: CapturedRow[] = [];
  const advisoryLocks: unknown[] = [];
  const client = {
    $executeRaw: jest.fn(async (...args: unknown[]) => {
      advisoryLocks.push(args.length);
      return 0;
    }),
    auditLog: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: { data: CapturedRow }) => {
        rows.push(args.data);
        return args.data;
      }),
    },
  } as unknown as AuditLogWriteClient;
  return { client, rows, advisoryLocks };
}

describe('recordManualDirectoryCatalogChange', () => {
  it('accepts a catalogue creation through the real audit policy', async () => {
    const { client, rows } = createAuditClient();
    const metadata = { source: 'manual_directory_catalog', after: { name: 'Users' } };
    await expect(
      recordManualDirectoryCatalogChange(client, {
        action: auditLogActions.directoryCatalogUnitCreated,
        entityId: 'catalog-1',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        metadata,
      }),
    ).resolves.toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: auditLogActions.directoryCatalogUnitCreated,
      entityType: auditLogEntityTypes.directoryCatalogEntry,
      entityId: 'catalog-1',
      organizationalUnitId: null,
      chainPartition: 'global',
    });
    expect(rows[0]?.metadata).toEqual(metadata);
  });

  it('accepts a catalogue update and keeps the descendant count in the allowlist', async () => {
    const { client, rows } = createAuditClient();
    await recordManualDirectoryCatalogChange(client, {
      action: auditLogActions.directoryCatalogUnitUpdated,
      entityId: 'catalog-1',
      actorUserId: 'admin-1',
      requestId: 'req-1',
      metadata: {
        source: 'manual_directory_catalog',
        before: { name: 'Users' },
        after: { name: 'Staff' },
        affectedDescendantCount: 3,
      },
    });
    expect(rows[0]).toMatchObject({
      action: auditLogActions.directoryCatalogUnitUpdated,
      entityType: auditLogEntityTypes.directoryCatalogEntry,
    });
  });

  it('accepts a catalogue deletion', async () => {
    const { client, rows } = createAuditClient();
    await recordManualDirectoryCatalogChange(client, {
      action: auditLogActions.directoryCatalogUnitDeleted,
      entityId: 'catalog-1',
      actorUserId: 'admin-1',
      requestId: 'req-1',
      metadata: {
        source: 'manual_directory_catalog',
        before: { name: 'Users' },
        removedRoleAssignments: 2,
        affectedUserCount: 1,
      },
    });
    expect(rows[0]).toMatchObject({
      action: auditLogActions.directoryCatalogUnitDeleted,
      chainPartition: 'global',
    });
  });

  it('still refuses the exact production call: organizational_unit.created without a unit', async () => {
    const { client, rows } = createAuditClient();
    await expect(
      appendAuditLog(client, {
        action: auditLogActions.organizationalUnitCreated,
        entityType: auditLogEntityTypes.organizationalUnit,
        entityId: 'catalog-1',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        organizationalUnitId: null,
        metadata: { source: 'manual_directory_catalog', after: {} },
      }),
    ).rejects.toThrow('AUDIT_SCOPE_REQUIRED:organizational_unit.created');
    expect(rows).toHaveLength(0);
  });

  it('refuses a catalog action pointed at the wrong entity type', async () => {
    const { client } = createAuditClient();
    await expect(
      appendAuditLog(client, {
        action: auditLogActions.directoryCatalogUnitCreated,
        entityType: auditLogEntityTypes.organizationalUnit,
        entityId: 'catalog-1',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        organizationalUnitId: null,
        metadata: { source: 'manual_directory_catalog', after: {} },
      }),
    ).rejects.toThrow(
      'AUDIT_ACTION_ENTITY_SCHEMA_NOT_REGISTERED:directory.catalog_organizational_unit.created:organizational_unit',
    );
  });

  it('refuses metadata the catalog schema does not allow', async () => {
    const { client } = createAuditClient();
    await expect(
      recordManualDirectoryCatalogChange(client, {
        action: auditLogActions.directoryCatalogUnitCreated,
        entityId: 'catalog-1',
        actorUserId: 'admin-1',
        requestId: 'req-1',
        metadata: { source: 'manual_directory_catalog', password: 'secret' },
      }),
    ).rejects.toThrow('AUDIT_METADATA_FIELD_NOT_ALLOWED');
  });

  it('keeps the catalog chain global, so it never takes an OU partition lock', async () => {
    const { client, rows } = createAuditClient();
    await recordManualDirectoryCatalogChange(client, {
      action: auditLogActions.directoryCatalogUnitCreated,
      entityId: 'catalog-1',
      actorUserId: null,
      requestId: null,
      metadata: { source: 'manual_directory_catalog', after: {} },
    });
    expect(rows[0]?.chainPartition).toBe('global');
  });
});
