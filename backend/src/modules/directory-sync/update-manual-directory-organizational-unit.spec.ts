import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import { updateManualDirectoryOrganizationalUnit } from './update-manual-directory-organizational-unit';

type CatalogRow = {
  externalId: string;
  displayName: string;
  parentExternalId: string | null;
  organizationalUnitPath: string;
  distinguishedName: string;
};

function createCatalogPrisma(seed: CatalogRow[]) {
  const rows = new Map(seed.map((row) => [row.externalId, { ...row }]));
  const api = {
    findUnique: async ({ where }: { where: { externalId: string } }) =>
      rows.get(where.externalId) ?? null,
    findMany: async () => [...rows.values()],
    update: async ({
      where,
      data,
    }: {
      where: { externalId: string };
      data: Partial<CatalogRow>;
    }) => {
      const current = rows.get(where.externalId);
      if (current === undefined) {
        throw new Error('missing');
      }
      const next = { ...current, ...data };
      rows.set(where.externalId, next);
      return next;
    },
  };
  return {
    rows,
    prisma: {
      manualDirectoryOrganizationalUnit: api,
      $transaction: async <T>(callback: (transaction: {
        manualDirectoryOrganizationalUnit: typeof api;
      }) => Promise<T>): Promise<T> =>
        callback({ manualDirectoryOrganizationalUnit: api }),
    },
  };
}

describe('updateManualDirectoryOrganizationalUnit', () => {
  it('cascades organizationalUnitPath and DN to children and grandchildren on rename', async () => {
    const { prisma, rows } = createCatalogPrisma([
      {
        externalId: 'ou:root',
        displayName: 'Users',
        parentExternalId: null,
        organizationalUnitPath: '/Users',
        distinguishedName: 'OU=Users,DC=example,DC=com',
      },
      {
        externalId: 'ou:child',
        displayName: 'IT',
        parentExternalId: 'ou:root',
        organizationalUnitPath: '/Users/IT',
        distinguishedName: 'OU=IT,OU=Users,DC=example,DC=com',
      },
      {
        externalId: 'ou:grandchild',
        displayName: 'Helpdesk',
        parentExternalId: 'ou:child',
        organizationalUnitPath: '/Users/IT/Helpdesk',
        distinguishedName: 'OU=Helpdesk,OU=IT,OU=Users,DC=example,DC=com',
      },
    ]);
    const updated = await updateManualDirectoryOrganizationalUnit(
      prisma as never,
      'ou:root',
      { displayName: 'Staff' },
    );
    expect(updated.organizationalUnitPath).toBe('/Staff');
    expect(updated.distinguishedName).toBe('OU=Staff,DC=example,DC=com');
    expect(rows.get('ou:child')).toMatchObject({
      organizationalUnitPath: '/Staff/IT',
      distinguishedName: 'OU=IT,OU=Staff,DC=example,DC=com',
    });
    expect(rows.get('ou:grandchild')).toMatchObject({
      organizationalUnitPath: '/Staff/IT/Helpdesk',
      distinguishedName: 'OU=Helpdesk,OU=IT,OU=Staff,DC=example,DC=com',
    });
  });

  it('cascades paths when an OU is moved under a new parent', async () => {
    const { prisma, rows } = createCatalogPrisma([
      {
        externalId: 'ou:a',
        displayName: 'A',
        parentExternalId: null,
        organizationalUnitPath: '/A',
        distinguishedName: 'OU=A,DC=example,DC=com',
      },
      {
        externalId: 'ou:b',
        displayName: 'B',
        parentExternalId: null,
        organizationalUnitPath: '/B',
        distinguishedName: 'OU=B,DC=example,DC=com',
      },
      {
        externalId: 'ou:b-child',
        displayName: 'Child',
        parentExternalId: 'ou:b',
        organizationalUnitPath: '/B/Child',
        distinguishedName: 'OU=Child,OU=B,DC=example,DC=com',
      },
    ]);
    await updateManualDirectoryOrganizationalUnit(prisma as never, 'ou:b', {
      parentExternalId: 'ou:a',
    });
    expect(rows.get('ou:b')).toMatchObject({
      parentExternalId: 'ou:a',
      organizationalUnitPath: '/A/B',
      distinguishedName: 'OU=B,OU=A,DC=example,DC=com',
    });
    expect(rows.get('ou:b-child')).toMatchObject({
      organizationalUnitPath: '/A/B/Child',
      distinguishedName: 'OU=Child,OU=B,OU=A,DC=example,DC=com',
    });
  });

  it('rejects moving an OU under its own descendant', async () => {
    const { prisma } = createCatalogPrisma([
      {
        externalId: 'ou:root',
        displayName: 'Users',
        parentExternalId: null,
        organizationalUnitPath: '/Users',
        distinguishedName: 'OU=Users,DC=example,DC=com',
      },
      {
        externalId: 'ou:child',
        displayName: 'IT',
        parentExternalId: 'ou:root',
        organizationalUnitPath: '/Users/IT',
        distinguishedName: 'OU=IT,OU=Users,DC=example,DC=com',
      },
      {
        externalId: 'ou:grandchild',
        displayName: 'Helpdesk',
        parentExternalId: 'ou:child',
        organizationalUnitPath: '/Users/IT/Helpdesk',
        distinguishedName: 'OU=Helpdesk,OU=IT,OU=Users,DC=example,DC=com',
      },
    ]);
    await expect(
      updateManualDirectoryOrganizationalUnit(prisma as never, 'ou:root', {
        parentExternalId: 'ou:grandchild',
      }),
    ).rejects.toMatchObject({ code: 'CIRCULAR_REFERENCE' });
    await expect(
      updateManualDirectoryOrganizationalUnit(prisma as never, 'ou:root', {
        parentExternalId: 'ou:root',
      }),
    ).rejects.toBeInstanceOf(ManualDirectoryCatalogError);
  });
});