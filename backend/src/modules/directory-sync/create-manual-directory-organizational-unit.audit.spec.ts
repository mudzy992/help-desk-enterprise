jest.mock('../../generated/prisma/enums', () => ({
  OrganizationalUnitType: {
    DIRECTORATE: 'DIRECTORATE',
    BRANCH: 'BRANCH',
    OFFICE: 'OFFICE',
    SECTOR: 'SECTOR',
    SERVICE: 'SERVICE',
  },
}), { virtual: true });

import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { createManualDirectoryOrganizationalUnit } from './create-manual-directory-organizational-unit';

/**
 * W2.35b: the end-to-end regression for the reported 500.
 *
 * The sibling spec replaces the audit helper with a jest mock, which is exactly why
 * the bug shipped: the transaction "succeeded" in the test while production threw
 * `AUDIT_SCOPE_REQUIRED:organizational_unit.created` inside `prepareAuditEntry` and
 * rolled the whole transaction back. Here nothing is mocked except the database
 * client, so the real policy, the real hash chain and the real transaction order run.
 */
describe('createManualDirectoryOrganizationalUnit audit trail', () => {
  it('writes a global catalog entry and does not fail on the audit policy', async () => {
    const created = {
      id: 'catalog-1',
      externalId: 'manual_only:ou:users',
      displayName: 'Users',
      distinguishedName: 'OU=Users,DC=example,DC=com',
      organizationalUnitPath: '/Users',
      parentExternalId: null,
      type: 'BRANCH',
    };
    const auditRows: Array<Record<string, unknown>> = [];
    const transaction = {
      manualDirectoryOrganizationalUnit: {
        create: jest.fn().mockResolvedValue(created),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          auditRows.push(args.data);
          return args.data;
        }),
      },
    };
    const prisma = {
      manualDirectoryOrganizationalUnit: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback(transaction),
      ),
    };

    const result = await createManualDirectoryOrganizationalUnit(
      prisma as never,
      { displayName: 'Users' },
      { actorUserId: 'super-admin-1', requestId: 'req-1' },
    );

    expect(result.id).toBe('catalog-1');
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      action: auditLogActions.directoryCatalogUnitCreated,
      entityType: auditLogEntityTypes.directoryCatalogEntry,
      entityId: 'catalog-1',
      organizationalUnitId: null,
      chainPartition: 'global',
      actorUserId: 'super-admin-1',
      requestId: 'req-1',
    });
    expect(auditRows[0]?.metadata).toMatchObject({
      source: 'manual_directory_catalog',
      after: {
        name: 'Users',
        distinguishedName: 'OU=Users,DC=example,DC=com',
        organizationalUnitPath: '/Users',
        parentExternalId: null,
        type: 'BRANCH',
      },
    });
  });

  it('rolls the row back when the audit write itself fails', async () => {
    const created = {
      id: 'catalog-2',
      externalId: 'manual_only:ou:finance',
      displayName: 'Finance',
      distinguishedName: 'OU=Finance,DC=example,DC=com',
      organizationalUnitPath: '/Finance',
      parentExternalId: null,
      type: 'BRANCH',
    };
    const auditFailure = new Error('audit unavailable');
    const transaction = {
      manualDirectoryOrganizationalUnit: {
        create: jest.fn().mockResolvedValue(created),
        delete: jest.fn().mockResolvedValue(created),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(auditFailure),
      },
    };
    const prisma = {
      manualDirectoryOrganizationalUnit: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) =>
        callback(transaction),
      ),
    };

    await expect(
      createManualDirectoryOrganizationalUnit(
        prisma as never,
        { displayName: 'Finance' },
        { actorUserId: 'super-admin-1', requestId: 'req-2' },
      ),
    ).rejects.toBe(auditFailure);
  });
});
