import type { PrismaService } from '../../common/prisma/prisma.service';
import { createOrganizationalUnitFromTree } from './create-organizational-unit-from-tree';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';

/**
 * W2.36c: the operator's installation has exactly one tree unit —
 * `/Korisnici` with `OU=Korisnici,DC=local` — and the catalogue seed lived in
 * `DC=example,DC=com`. Every unit added from the screen was therefore written to
 * the catalogue with a DN outside the configured base, no read accepted it, and
 * the tree never received it. These tests pin the replacement path:
 *
 * - the client supplies **no DN**, so it cannot mis-type one;
 * - the parent is a tree row, and a catalogue row is mirrored for it;
 * - both rows commit in one transaction, so there is no "saved but invisible".
 */
describe('createOrganizationalUnitFromTree (W2.36c)', () => {
  type Row = Record<string, unknown>;

  function createHarness(options?: {
    readonly tree?: readonly Row[];
    readonly catalog?: readonly Row[];
  }) {
    const tree = [...(options?.tree ?? [])];
    const catalog = [...(options?.catalog ?? [])];
    let sequence = 0;
    const nextId = (prefix: string) => `${prefix}-${++sequence}`;

    const matchAll = (rows: readonly Row[], where: Record<string, unknown>) =>
      rows.filter((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      );

    const client: Record<string, unknown> = {
      organizationalUnit: {
        findMany: jest.fn(async () => tree.map((row) => ({ ...row }))),
        findUnique: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            const [row] = matchAll(tree, where);
            return row === undefined ? null : { ...row };
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: nextId('ou'), ...data };
          tree.push(row);
          return row;
        }),
      },
      manualDirectoryOrganizationalUnit: {
        findUnique: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            const [row] = matchAll(catalog, where);
            return row === undefined ? null : { ...row };
          },
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: nextId('catalog'), ...data };
          catalog.push(row);
          return row;
        }),
      },
      auditLog: {
        // `appendAuditLog` chains entries: it locks, reads the tail, then inserts.
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: nextId('audit') })),
      },
      // `bumpOrganizationalUnitCatalogRevision` reads the current revision first.
      organizationalUnitCatalogRevision: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'revision-1' })),
        update: jest.fn(async () => ({ id: 'revision-1' })),
        upsert: jest.fn(async () => ({ id: 'revision-1', revision: 2n })),
      },
      $executeRaw: jest.fn(async () => 1),
      $queryRaw: jest.fn(async () => [{ revision: 1 }]),
      $transaction: jest.fn(
        async (callback: (transaction: unknown) => Promise<unknown>) =>
          callback(client),
      ),
    };
    return {
      prisma: client as unknown as PrismaService,
      tree,
      catalog,
      audit: client.auditLog as { create: jest.Mock },
      transaction: client.$transaction as jest.Mock,
    };
  }

  const rootUnit = {
    id: 'ou-korisnici',
    name: 'Korisnici',
    type: 'DIRECTORATE',
    distinguishedName: 'OU=Korisnici,DC=local',
    ouPath: '/Korisnici',
    parentId: null,
  };

  it('derives the DN from the tree parent and writes both rows in one transaction', async () => {
    const harness = createHarness({ tree: [rootUnit] });

    const created = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: ' Podružnica Zenica ',
      parentOrganizationalUnitId: 'ou-korisnici',
      type: 'BRANCH',
    });

    expect(created.organizationalUnit).toMatchObject({
      name: 'Podružnica Zenica',
      distinguishedName: 'OU=Podružnica Zenica,OU=Korisnici,DC=local',
      ouPath: '/Korisnici/Podružnica Zenica',
      parentId: 'ou-korisnici',
      type: 'BRANCH',
    });
    expect(created.catalogEntry).toMatchObject({
      organizationalUnitPath: '/Korisnici/Podružnica Zenica',
      distinguishedName: 'OU=Podružnica Zenica,OU=Korisnici,DC=local',
      parentExternalId: 'manual_only:ou:' + externalIdHash('/Korisnici'),
    });
    // The parent was adopted into the catalogue, so the child has a real parent row.
    expect(harness.catalog.map((row) => row.organizationalUnitPath)).toEqual([
      '/Korisnici',
      '/Korisnici/Podružnica Zenica',
    ]);
    // One transaction, and both audit entries (OU-scoped + catalogue-level).
    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.audit.create).toHaveBeenCalledTimes(2);
  });

  it('creates a root unit in the namespace the tree already uses', async () => {
    const harness = createHarness({ tree: [rootUnit] });

    const created = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: 'Sektor podrške',
    });

    expect(created.organizationalUnit).toMatchObject({
      distinguishedName: 'OU=Sektor podrške,DC=local',
      ouPath: '/Sektor podrške',
      parentId: null,
      type: 'DIRECTORATE',
    });
  });

  it('refuses a name a distinguished name cannot carry, and says which rule broke', async () => {
    const harness = createHarness({ tree: [rootUnit] });

    const thrown = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: 'Prodaja, DC=evil',
      parentOrganizationalUnitId: 'ou-korisnici',
    }).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ManualDirectoryCatalogError);
    expect((thrown as ManualDirectoryCatalogError).code).toBe('INVALID_NAME');
    expect((thrown as ManualDirectoryCatalogError).details).toEqual({
      reason: 'forbidden_character',
    });
    expect(harness.tree).toHaveLength(1);
    expect(harness.catalog).toHaveLength(0);
  });

  it('refuses an unknown parent instead of inventing one', async () => {
    const harness = createHarness({ tree: [rootUnit] });

    const thrown = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: 'Prodaja',
      parentOrganizationalUnitId: 'ou-from-catalog-only',
    }).catch((error: unknown) => error);

    expect((thrown as ManualDirectoryCatalogError).code).toBe('PARENT_NOT_FOUND');
    expect(harness.tree).toHaveLength(1);
  });

  it('refuses a duplicate path before writing anything', async () => {
    const harness = createHarness({
      tree: [
        rootUnit,
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

    const thrown = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: 'Prodaja',
      parentOrganizationalUnitId: 'ou-korisnici',
    }).catch((error: unknown) => error);

    expect((thrown as ManualDirectoryCatalogError).code).toBe(
      'DUPLICATE_DISTINGUISHED_NAME',
    );
    expect(harness.tree).toHaveLength(2);
    expect(harness.catalog).toHaveLength(0);
  });

  it('refuses to create a root when the tree has no namespace to inherit', async () => {
    const harness = createHarness();

    const thrown = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: 'Prodaja',
    }).catch((error: unknown) => error);

    expect((thrown as ManualDirectoryCatalogError).code).toBe(
      'DIRECTORY_NAMESPACE_UNKNOWN',
    );
  });

  it('names the stale catalogue row instead of adopting it silently', async () => {
    const harness = createHarness({
      tree: [rootUnit],
      catalog: [
        {
          id: 'catalog-users',
          externalId: 'manual_only:ou:stale',
          displayName: 'Korisnici',
          distinguishedName: 'OU=Korisnici,DC=example,DC=com',
          organizationalUnitPath: '/Korisnici',
          parentExternalId: null,
          type: 'DIRECTORATE',
        },
      ],
    });

    const thrown = await createOrganizationalUnitFromTree(harness.prisma, {
      displayName: 'Prodaja',
      parentOrganizationalUnitId: 'ou-korisnici',
    }).catch((error: unknown) => error);

    expect((thrown as ManualDirectoryCatalogError).code).toBe('DUPLICATE_PATH');
    expect((thrown as ManualDirectoryCatalogError).details).toMatchObject({
      organizationalUnitPath: '/Korisnici',
      catalogDistinguishedName: 'OU=Korisnici,DC=example,DC=com',
      distinguishedName: 'OU=Korisnici,DC=local',
    });
  });
});

function externalIdHash(path: string): string {
  // Mirrors `createManualDirectoryOrganizationalUnitExternalId`, which is the
  // production identity function; the test only asserts it is the path-derived id.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(path).digest('base64url');
}
