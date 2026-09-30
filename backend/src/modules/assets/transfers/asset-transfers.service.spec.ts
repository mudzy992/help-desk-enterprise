import { AssetError } from '../assets.constants';
import type { AssetViewer } from '../asset-viewer';
import { AssetTransfersService } from './asset-transfers.service';

const viewer: AssetViewer = { userId: 'agent', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const unit = { id: 'ou-it', ouPath: '/root/it', name: 'IT' };

function user(id: string, name: string, organizationalUnitId: string | null = 'ou-it') {
  return {
    id,
    displayName: name,
    email: `${id}@example.com`,
    isActive: true,
    anonymizedAt: null,
    organizationalUnitId,
    organizationalUnit: organizationalUnitId ? { id: organizationalUnitId, name: 'IT', ouPath: '/root/it' } : null,
  };
}

function asset(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    assetTag: `INV-${id}`,
    name: `Laptop ${id}`,
    status: 'IN_STOCK',
    assignedUserId: null,
    version: 1,
    serialNumber: null,
    manufacturer: 'Dell',
    model: null,
    type: { nameBs: 'Laptop', nameEn: 'Laptop' },
    organizationalUnit: unit,
    location: null,
    ...overrides,
  };
}

function setup(options: { settings?: Record<string, unknown>; assets?: ReturnType<typeof asset>[]; updateCount?: number } = {}) {
  const users = new Map([
    ['agent', user('agent', 'Agent')],
    ['u1', user('u1', 'Amra')],
    ['u2', user('u2', 'Edin')],
    ['boss', user('boss', 'Šef')],
  ]);
  const settings: Record<string, unknown> = {
    'private.assets.transfer.enabled': true,
    'private.assets.transfer.required': false,
    'private.assets.transfer.numberFormat': '{MM}-{NNNN}-{YYYY}',
    'private.i18n.defaultLocale': 'bs',
    ...options.settings,
  };
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ lastNumber: 7 }]),
    assetTransfer: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tr1', number: data.number })) },
    asset: { updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }) },
    assetEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    asset: { findMany: jest.fn().mockResolvedValue(options.assets ?? [asset('a1')]) },
    user: { findUnique: jest.fn(({ where }) => Promise.resolve(users.get(where.id) ?? null)) },
    organizationalUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'ou-root', parentId: null }, { id: 'ou-it', parentId: 'ou-root' }]) },
    assetSignatory: {
      findMany: jest.fn().mockResolvedValue([{ organizationalUnitId: 'ou-root', userId: 'boss', title: 'Direktor', user: { isActive: true, anonymizedAt: null } }]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    assetTransferTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
    assetLocation: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    auditLogEntry: { create: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) => callback(transaction)),
  };
  const access = {
    readSetting: jest.fn((key: string, fallback: unknown) => Promise.resolve(key in settings ? settings[key] : fallback)),
    require: jest.fn().mockResolvedValue({ all: true }),
    requireEnabled: jest.fn(),
    requireUnitInScope: jest.fn().mockResolvedValue(unit),
    scope: jest.fn().mockResolvedValue({ all: true }),
  };
  const settingsService = { getSetting: jest.fn().mockResolvedValue('Europe/Sarajevo') };
  const service = new AssetTransfersService(prisma as never, access as never, settingsService as never);
  // Audit writes are covered elsewhere.
  jest.spyOn(service as unknown as { audit: () => Promise<void> }, 'audit').mockResolvedValue(undefined);
  return { service, prisma, transaction };
}

describe('AssetTransfersService.move (3.2 C9)', () => {
  it('warehouse → user: moves, numbers monthly and freezes the snapshot', async () => {
    const { service, transaction } = setup();
    const result = await service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1', fromLabel: '' }, viewer);
    expect(result).toEqual({ transferId: 'tr1', number: expect.stringMatching(/^\d{2}-0007-\d{4}$/), movedAssetIds: ['a1'] });
    const created = transaction.assetTransfer.create.mock.calls[0][0].data;
    expect(created.snapshot.from.name).toBe('Skladište');
    expect(created.snapshot.to.name).toBe('Amra');
    // Signatory inherited from the root unit.
    expect(created.snapshot.signatory).toMatchObject({ name: 'Šef', title: 'Direktor' });
    expect(created.items.create).toEqual([{ assetId: 'a1', position: 1 }]);
    expect(transaction.asset.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'a1', version: 1, assignedUserId: null },
      data: { assignedUserId: 'u1', status: 'IN_USE' },
    });
    expect(transaction.assetEvent.create).toHaveBeenCalledTimes(1);
    expect(transaction.assetEvent.create.mock.calls[0][0].data).toMatchObject({ action: 'assigned', detail: { transferId: 'tr1' } });
  });

  it('first issue with free text prints who handed over', async () => {
    const { service, transaction } = setup();
    await service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1', fromLabel: 'Dobavljač d.o.o.' }, viewer);
    expect(transaction.assetTransfer.create.mock.calls[0][0].data).toMatchObject({ fromLabel: 'Dobavljač d.o.o.', fromUserId: null });
  });

  it('user → user writes unassigned + assigned events', async () => {
    const { service, transaction } = setup({ assets: [asset('a1', { status: 'IN_USE', assignedUserId: 'u1' })] });
    await service.move({ scenario: 'USER_TO_USER', assetIds: ['a1'], toUserId: 'u2' }, viewer);
    expect(transaction.assetEvent.create.mock.calls.map((call) => call[0].data.action)).toEqual(['unassigned', 'assigned']);
    expect(transaction.assetTransfer.create.mock.calls[0][0].data).toMatchObject({ fromUserId: 'u1', toUserId: 'u2' });
  });

  it('user → warehouse returns to stock and prints the warehouse', async () => {
    const { service, transaction } = setup({ assets: [asset('a1', { status: 'IN_USE', assignedUserId: 'u1' })] });
    await service.move({ scenario: 'USER_TO_WAREHOUSE', assetIds: ['a1'], returnStatus: 'IN_STOCK' }, viewer);
    expect(transaction.asset.updateMany.mock.calls[0][0].data).toMatchObject({ assignedUserId: null, status: 'IN_STOCK' });
    expect(transaction.assetTransfer.create.mock.calls[0][0].data).toMatchObject({ toLabel: 'Skladište', toUserId: null });
  });

  it('without a record when the organization opts out for this move', async () => {
    const { service, transaction } = setup();
    const result = await service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1', issueDocument: false }, viewer);
    expect(result.transferId).toBeNull();
    expect(transaction.assetTransfer.create).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('a required record cannot be skipped', async () => {
    const { service, transaction } = setup({ settings: { 'private.assets.transfer.required': true } });
    await service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1', issueDocument: false }, viewer);
    expect(transaction.assetTransfer.create).toHaveBeenCalled();
    await expect(service.assertDirectMoveAllowed()).rejects.toMatchObject({ code: 'ASSET_TRANSFER_REQUIRED' });
  });

  it('refuses mixed holders and concurrent changes', async () => {
    const mixed = setup({ assets: [asset('a1', { status: 'IN_USE', assignedUserId: 'u1' }), asset('a2', { status: 'IN_USE', assignedUserId: 'u2' })] });
    await expect(mixed.service.move({ scenario: 'USER_TO_WAREHOUSE', assetIds: ['a1', 'a2'] }, viewer)).rejects.toMatchObject({
      code: 'ASSET_TRANSFER_INVALID',
      detail: 'different_holders',
    });
    const raced = setup({ updateCount: 0 });
    await expect(raced.service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1' }, viewer)).rejects.toBeInstanceOf(AssetError);
  });

  it('an asset out of scope reads as not found', async () => {
    const { service } = setup({ assets: [] });
    await expect(service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1' }, viewer)).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
  });
});
