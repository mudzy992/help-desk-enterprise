import type { PrismaService } from '../../common/prisma/prisma.service';
import { seedManualDirectoryCatalog } from './seed-manual-directory-catalog';

/**
 * W2.36c: the seed wrote `OU=Users,DC=example,DC=com` into installations whose
 * tree was `OU=Korisnici,DC=local`, and set the read bases to the sample
 * namespace. From then on the catalogue and the tree could not meet: units added
 * from the screen got DNs no read accepted.
 *
 * These tests pin the fix: an installation that already has a tree gets a
 * catalogue that mirrors it, and base DNs that come from it.
 */
describe('seedManualDirectoryCatalog (W2.36c)', () => {
  function createHarness(options?: {
    readonly tree?: readonly Record<string, unknown>[];
    readonly existingCatalogRows?: number;
    readonly existingSettings?: readonly string[];
  }) {
    const settings = new Map<string, unknown>();
    for (const key of options?.existingSettings ?? []) {
      settings.set(key, 'preexisting');
    }
    const catalogRows: Record<string, unknown>[] = [];
    const client: Record<string, unknown> = {
      organizationalUnit: {
        findMany: jest.fn(async () => [...(options?.tree ?? [])]),
      },
      manualDirectoryOrganizationalUnit: {
        count: jest.fn(async () => options?.existingCatalogRows ?? catalogRows.length),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          catalogRows.push(data);
          return data;
        }),
        createMany: jest.fn(async () => ({ count: 0 })),
      },
      manualDirectoryUser: { createMany: jest.fn(async () => ({ count: 0 })) },
      manualDirectoryGroup: { createMany: jest.fn(async () => ({ count: 0 })) },
      appSetting: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          settings.has(where.key) ? { id: where.key } : null,
        ),
        create: jest.fn(
          async ({ data }: { data: { key: string; value: unknown } }) => {
            settings.set(data.key, data.value);
            return data;
          },
        ),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    return { prisma: client as unknown as PrismaService, settings, catalogRows };
  }

  it('mirrors the existing tree instead of seeding the sample namespace', async () => {
    const harness = createHarness({
      tree: [
        {
          id: 'ou-korisnici',
          name: 'Korisnici',
          type: 'DIRECTORATE',
          distinguishedName: 'OU=Korisnici,DC=local',
          ouPath: '/Korisnici',
          parentId: null,
        },
        {
          id: 'ou-prodaja',
          name: 'Prodaja',
          type: 'BRANCH',
          distinguishedName: 'OU=Prodaja,OU=Korisnici,DC=local',
          ouPath: '/Korisnici/Prodaja',
          parentId: 'ou-korisnici',
        },
      ],
    });

    const result = await seedManualDirectoryCatalog(harness.prisma);

    expect(result).toEqual({ seeded: true, adoptedTree: true });
    expect(harness.catalogRows.map((row) => row.organizationalUnitPath)).toEqual([
      '/Korisnici',
      '/Korisnici/Prodaja',
    ]);
    const prodaja = harness.catalogRows[1]!;
    // The child points at the mirrored parent, so the catalogue is a coherent tree.
    expect(prodaja.parentExternalId).toBe(harness.catalogRows[0]!.externalId);
    expect(prodaja.distinguishedName).toBe('OU=Prodaja,OU=Korisnici,DC=local');
    // Base DNs come from the operator's namespace, not from `DC=example,DC=com`.
    expect(harness.settings.get('private.auth.adRead.usersBaseDn')).toBe(
      'OU=Korisnici,DC=local',
    );
    expect(harness.settings.get('private.auth.adRead.groupsBaseDn')).toBe('');
  });

  it('seeds the sample catalogue only into an empty installation', async () => {
    const harness = createHarness();

    const result = await seedManualDirectoryCatalog(harness.prisma);

    expect(result).toEqual({ seeded: true, adoptedTree: false });
    expect(harness.settings.get('private.auth.adRead.usersBaseDn')).toBe(
      'OU=Users,DC=example,DC=com',
    );
    expect(
      (harness.prisma as unknown as {
        manualDirectoryOrganizationalUnit: { createMany: jest.Mock };
      }).manualDirectoryOrganizationalUnit.createMany,
    ).toHaveBeenCalled();
  });

  it('never overwrites an existing catalogue or existing settings', async () => {
    const harness = createHarness({
      tree: [
        {
          id: 'ou-korisnici',
          name: 'Korisnici',
          type: 'DIRECTORATE',
          distinguishedName: 'OU=Korisnici,DC=local',
          ouPath: '/Korisnici',
          parentId: null,
        },
      ],
      existingCatalogRows: 3,
      existingSettings: ['private.auth.adRead.usersBaseDn'],
    });

    const result = await seedManualDirectoryCatalog(harness.prisma);

    expect(result).toEqual({ seeded: false, adoptedTree: false });
    expect(harness.catalogRows).toHaveLength(0);
    expect(harness.settings.get('private.auth.adRead.usersBaseDn')).toBe('preexisting');
  });
});
