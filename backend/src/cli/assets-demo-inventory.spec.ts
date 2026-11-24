import type { PrismaClient } from '../generated/prisma/client';
import { demoAssetTypeKeys, demoMarker, planDemoInventory } from './assets-demo-inventory';

/*
  W1.5 (`BA-xcut-08`): the dry run is the default precisely because the old
  command wrote first and told you afterwards. This test holds that promise at the
  cheapest possible level: the read-only client below throws on any write, so a
  plan that touched the database would fail here instead of in production.
*/

type ReadOnly = Readonly<{
  assets: Array<{ id: string; tickets: Array<{ ticketId: string }> }>;
  locations: number;
  licenses: number;
  contracts: number;
  typeKeys: readonly string[];
  rootPath: string | null;
}>;

function readOnlyClient(state: ReadOnly) {
  const writes: string[] = [];
  const write = (name: string) => async () => {
    writes.push(name);
    throw new Error(`dry run wrote through ${name}`);
  };
  const client = {
    asset: {
      findMany: async () => state.assets,
      count: async () => state.assets.length,
      create: write('asset.create'),
      deleteMany: write('asset.deleteMany'),
    },
    assetLocation: { count: async () => state.locations, create: write('assetLocation.create'), deleteMany: write('assetLocation.deleteMany') },
    softwareLicense: { count: async () => state.licenses, create: write('softwareLicense.create'), deleteMany: write('softwareLicense.deleteMany') },
    assetContract: { count: async () => state.contracts, create: write('assetContract.create'), deleteMany: write('assetContract.deleteMany') },
    assetType: {
      findMany: async () => state.typeKeys.map((key) => ({ key })),
      create: write('assetType.create'),
    },
    organizationalUnit: { findFirst: async () => (state.rootPath === null ? null : { ouPath: state.rootPath }) },
    $transaction: write('$transaction'),
    $executeRaw: write('$executeRaw'),
  };
  return { client: client as unknown as PrismaClient, writes };
}

const emptyState = (overrides: Partial<ReadOnly> = {}): ReadOnly => ({
  assets: [],
  locations: 0,
  licenses: 0,
  contracts: 0,
  typeKeys: [...demoAssetTypeKeys],
  rootPath: '/firma',
  ...overrides,
});

describe('demo inventory plan is read-only (W1.5, BA-xcut-08)', () => {
  it('reports an empty database as seedable without writing anything', async () => {
    const { client, writes } = readOnlyClient(emptyState());
    const plan = await planDemoInventory(client);
    expect(writes).toEqual([]);
    expect(plan).toMatchObject({
      alreadyPresent: false,
      demoAssets: 0,
      removableAssets: 0,
      retainedAssets: 0,
      unitPath: '/firma',
    });
    expect(plan.missingAssetTypes).toEqual([]);
  });

  it('splits present demo assets into removable and ticket-referenced ones', async () => {
    const { client, writes } = readOnlyClient(
      emptyState({
        assets: [
          { id: 'a1', tickets: [] },
          { id: 'a2', tickets: [] },
          { id: 'a3', tickets: [{ ticketId: 't1' }] },
        ],
        locations: 4,
        licenses: 4,
        contracts: 2,
      }),
    );
    const plan = await planDemoInventory(client);
    expect(writes).toEqual([]);
    expect(plan).toMatchObject({
      alreadyPresent: true,
      demoAssets: 3,
      removableAssets: 2,
      retainedAssets: 1,
      demoLocations: 4,
      demoLicenses: 4,
      demoContracts: 2,
    });
  });

  it('names the asset types the seed would skip instead of inventing them', async () => {
    const { client } = readOnlyClient(emptyState({ typeKeys: ['laptop', 'monitor'] }));
    const plan = await planDemoInventory(client);
    expect(plan.missingAssetTypes).toEqual(demoAssetTypeKeys.filter((key) => key !== 'laptop' && key !== 'monitor'));
  });

  it('says so when the installation has no organisational unit yet', async () => {
    const { client } = readOnlyClient(emptyState({ rootPath: null }));
    await expect(planDemoInventory(client)).resolves.toMatchObject({ unitPath: null });
  });
});

/* The marker is the contract with `--remove`; a rename would orphan the data. */
it('keeps the DEMO marker that identifies removable demo rows', () => {
  expect(demoMarker).toBe('DEMO');
});
