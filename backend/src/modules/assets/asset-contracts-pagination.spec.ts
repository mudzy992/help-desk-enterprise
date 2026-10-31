import { AssetContractsService } from './asset-contracts.service';
import type { AssetViewer } from './asset-viewer';

const viewer: AssetViewer = { userId: 'reader', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };

const contractRow = (id: string) => ({
  id,
  kind: 'WARRANTY' as const,
  supplier: `Supplier ${id}`,
  reference: null,
  startsAt: null,
  endsAt: new Date('2030-01-01T00:00:00Z'),
  cost: null,
  notes: null,
  organizationalUnit: { id: 'ou-1', name: 'Root', ouPath: '/root' },
  _count: { items: 3 },
  updatedAt: new Date('2026-10-31T00:00:00Z'),
});

describe('AssetContractsService cursor pages', () => {
  it('uses deterministic contract cursors and reports whether another page exists', async () => {
    const prisma = { assetContract: { findMany: jest.fn().mockResolvedValue([contractRow('c-1'), contractRow('c-2')]) } };
    const access = { require: jest.fn().mockResolvedValue({ all: true }) };
    const service = new AssetContractsService(prisma as never, access as never);

    const result = await service.list({ limit: 1, cursor: 'c-0', includeExpired: true }, viewer);

    expect(result).toMatchObject({ items: [{ id: 'c-1' }], hasMore: true, nextCursor: 'c-1' });
    expect(prisma.assetContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        cursor: { id: 'c-0' },
        skip: 1,
        orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('pages visible contract items using the compound contract/asset cursor', async () => {
    const prisma = {
      assetContract: { findUnique: jest.fn().mockResolvedValue(contractRow('contract-1')) },
      assetContractItem: {
        findMany: jest.fn().mockResolvedValue([
          { contractId: 'contract-1', assetId: 'asset-1', asset: { id: 'asset-1', assetTag: 'A-1', name: 'Laptop 1', status: 'IN_STOCK' } },
          { contractId: 'contract-1', assetId: 'asset-2', asset: { id: 'asset-2', assetTag: 'A-2', name: 'Laptop 2', status: 'IN_STOCK' } },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const access = { require: jest.fn().mockResolvedValue({ all: true }) };
    const service = new AssetContractsService(prisma as never, access as never);

    const result = await service.listItems('contract-1', { cursor: 'asset-0', limit: 1 }, viewer);

    expect(result).toMatchObject({ items: [{ id: 'asset-1', assetTag: 'A-1' }], hasMore: true, nextCursor: 'asset-1' });
    expect(prisma.assetContractItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contractId: 'contract-1' },
        take: 2,
        cursor: { contractId_assetId: { contractId: 'contract-1', assetId: 'asset-0' } },
        skip: 1,
        orderBy: [{ asset: { assetTag: 'asc' } }, { assetId: 'asc' }],
      }),
    );
  });
});
