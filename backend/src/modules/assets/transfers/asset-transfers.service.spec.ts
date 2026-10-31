import { mkdtemp, mkdir, readFile, readdir, rm as removePath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { AssetError } from '../assets.constants';
import { scanAttachmentWithClamav } from '../../tickets/attachments/scan-attachment-with-clamav';
import type { AssetViewer } from '../asset-viewer';
import { AssetTransfersService } from './asset-transfers.service';

jest.mock('../../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));
jest.mock('../../tickets/attachments/scan-attachment-with-clamav', () => ({
  scanAttachmentWithClamav: jest.fn().mockResolvedValue(undefined),
}));

const recordAuditEntryMock = jest.mocked(recordAuditEntry);

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
    assetTransferSequence: { update: jest.fn().mockResolvedValue({}) },
    assetTransfer: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tr1', number: data.number })),
      aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 0 } }),
      update: jest.fn().mockResolvedValue({ id: 'tr1' }),
      updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
    },
    asset: { updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }) },
    assetEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  let transactionCommitted = false;
  recordAuditEntryMock.mockReset().mockResolvedValue(undefined);
  const prisma = {
    asset: { findMany: jest.fn().mockResolvedValue(options.assets ?? [asset('a1')]), findUnique: jest.fn() },
    assetTransfer: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn(({ where }) => Promise.resolve(users.get(where.id) ?? null)) },
    organizationalUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'ou-root', parentId: null }, { id: 'ou-it', parentId: 'ou-root' }]) },
    assetSignatory: {
      findMany: jest.fn().mockResolvedValue([{ organizationalUnitId: 'ou-root', userId: 'boss', title: 'Direktor', user: { isActive: true, anonymizedAt: null } }]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    assetTransferTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
    assetLocation: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    auditLogEntry: { create: jest.fn() },
    $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => {
      const result = await callback(transaction);
      transactionCommitted = true;
      return result;
    }),
  };
  const access = {
    readSetting: jest.fn((key: string, fallback: unknown) => Promise.resolve(key in settings ? settings[key] : fallback)),
    require: jest.fn().mockResolvedValue({ all: true }),
    requireEnabled: jest.fn(),
    locationsEnabled: jest.fn(() => Promise.resolve(settings['private.assets.locations.enabled'] === true)),
    requireUnitInScope: jest.fn().mockResolvedValue(unit),
    scope: jest.fn().mockResolvedValue({ all: true }),
  };
  const settingsService = { getSetting: jest.fn().mockResolvedValue('Europe/Sarajevo') };
  const service = new AssetTransfersService(prisma as never, access as never, settingsService as never);
  return { service, prisma, transaction, wasTransactionCommitted: () => transactionCommitted };
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

  it('does not commit an issued transfer when its audit append fails', async () => {
    const { service, transaction, wasTransactionCommitted } = setup();
    const failure = new Error('audit unavailable');
    recordAuditEntryMock.mockRejectedValueOnce(failure);

    await expect(service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1' }, viewer)).rejects.toBe(failure);

    expect(recordAuditEntryMock).toHaveBeenCalledWith(transaction, expect.objectContaining({ action: 'asset.transfer.issued' }));
    expect(wasTransactionCommitted()).toBe(false);
  });

  it('removes a newly uploaded signed file when its audit append fails and preserves the prior file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'asset-transfer-audit-'));
    const previousStoragePath = 'assets/transfers/tr1/previous.pdf';
    const previousAbsolutePath = join(root, previousStoragePath);
    await mkdir(join(root, 'assets/transfers/tr1'), { recursive: true });
    await writeFile(previousAbsolutePath, 'previous signed copy');

    try {
      const { service, transaction, wasTransactionCommitted } = setup();
      const transfer = {
        id: 'tr1',
        number: '26-0007-2026',
        status: 'ISSUED',
        signedStoragePath: previousStoragePath,
        signedFilePurgeRequestedAt: null,
        retentionRedactedAt: null,
      };
      const internals = service as unknown as {
        loadVisible: jest.Mock;
        requireManage: jest.Mock;
        uploadRoot: jest.Mock;
      };
      jest.spyOn(internals, 'loadVisible').mockResolvedValue({ transfer });
      jest.spyOn(internals, 'requireManage').mockResolvedValue(undefined);
      jest.spyOn(internals, 'uploadRoot').mockReturnValue(root);

      const failure = new Error('audit unavailable');
      recordAuditEntryMock.mockRejectedValueOnce(failure);
      const file = { fileName: 'signed.pdf', buffer: Buffer.from('%PDF-1.7 signed transfer') };

      await expect(service.uploadSigned('tr1', file, viewer)).rejects.toBe(failure);

      expect(scanAttachmentWithClamav).toHaveBeenCalledWith(file.buffer);
      expect(transaction.assetTransfer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'tr1', signedFilePurgeRequestedAt: null, retentionRedactedAt: null }),
        data: expect.objectContaining({
          status: 'SIGNED',
          signedStoragePath: expect.stringMatching(/^assets\/transfers\/tr1\//),
          signedFilePurgeRequestedAt: null,
        }),
      }));
      expect(wasTransactionCommitted()).toBe(false);
      expect(await readFile(previousAbsolutePath, 'utf8')).toBe('previous signed copy');
      expect(await readdir(join(root, 'assets/transfers/tr1'))).toEqual(['previous.pdf']);
    } finally {
      await removePath(root, { recursive: true, force: true });
    }
  });

  it('replaces the previous signed file after the audited transaction commits', async () => {
    const root = await mkdtemp(join(tmpdir(), 'asset-transfer-audit-success-'));
    const previousStoragePath = 'assets/transfers/tr1/previous.pdf';
    const directory = join(root, 'assets/transfers/tr1');
    const previousAbsolutePath = join(root, previousStoragePath);
    await mkdir(directory, { recursive: true });
    await writeFile(previousAbsolutePath, 'previous signed copy');

    try {
      const { service, transaction, wasTransactionCommitted } = setup();
      const transfer = {
        id: 'tr1',
        number: '26-0007-2026',
        status: 'ISSUED',
        signedStoragePath: previousStoragePath,
        signedFilePurgeRequestedAt: null,
        retentionRedactedAt: null,
      };
      const internals = service as unknown as {
        loadVisible: jest.Mock;
        requireManage: jest.Mock;
        uploadRoot: jest.Mock;
      };
      jest.spyOn(internals, 'loadVisible').mockResolvedValue({ transfer });
      jest.spyOn(internals, 'requireManage').mockResolvedValue(undefined);
      jest.spyOn(internals, 'uploadRoot').mockReturnValue(root);

      const file = { fileName: 'signed.pdf', buffer: Buffer.from('%PDF-1.7 signed transfer') };
      await expect(service.uploadSigned('tr1', file, viewer)).resolves.toEqual({
        id: 'tr1',
        status: 'SIGNED',
        signedFileName: 'signed.pdf',
      });

      expect(wasTransactionCommitted()).toBe(true);
      const newStoragePath = transaction.assetTransfer.updateMany.mock.calls[0][0].data.signedStoragePath;
      expect(newStoragePath).toMatch(/^assets\/transfers\/tr1\//);
      await expect(readFile(join(root, newStoragePath))).resolves.toEqual(file.buffer);
      await expect(readFile(previousAbsolutePath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(directory)).toEqual(newStoragePath.split('/').slice(-1));
    } finally {
      await removePath(root, { recursive: true, force: true });
    }
  });

  it('C9c: without locations the item place is the unit path; with them the location path', async () => {
    const off = setup({ assets: [asset('a1', { location: { id: 'l1', name: 'Soba 12' } })] });
    await off.service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1', locationId: 'l1' }, viewer);
    expect(off.transaction.assetTransfer.create.mock.calls[0][0].data.snapshot.items[0].location).toBe('root › it');
    expect(off.transaction.asset.updateMany.mock.calls[0][0].data).not.toHaveProperty('locationId');
    const on = setup({ settings: { 'private.assets.locations.enabled': true }, assets: [asset('a1', { location: { id: 'l1', name: 'Soba 12' } })] });
    await on.service.move({ scenario: 'WAREHOUSE_TO_USER', assetIds: ['a1'], toUserId: 'u1' }, viewer);
    expect(on.transaction.assetTransfer.create.mock.calls[0][0].data.snapshot.items[0].location).toBe('Soba 12');
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

describe('AssetTransfersService cursor pages', () => {
  const transferRow = (id: string) => ({
    id,
    number: `N-${id}`,
    scenario: 'WAREHOUSE_TO_USER',
    status: 'ISSUED',
    fromUserId: null,
    toUserId: viewer.userId,
    fromLabel: 'Skladište',
    toLabel: null,
    issuedAt: new Date('2026-10-31T10:00:00Z'),
    signedAt: null,
    cancelledAt: null,
    cancelReason: null,
    signedFileName: null,
    signedFilePurgeRequestedAt: null,
    retentionRedactedAt: null,
    snapshot: { from: { name: 'Skladište' }, to: { name: 'Agent' }, signatory: { name: '' }, items: [] },
    _count: { items: 0 },
  });

  it('paginates my transfer records with a deterministic cursor and hasMore', async () => {
    const { service, prisma } = setup();
    prisma.assetTransfer.findMany.mockResolvedValue([transferRow('tr-1'), transferRow('tr-2')] as never);

    const result = await service.mine(viewer, { cursor: 'tr-0', limit: 1 });

    expect(result).toMatchObject({ items: [{ id: 'tr-1' }], hasMore: true, nextCursor: 'tr-1' });
    expect(prisma.assetTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, cursor: { id: 'tr-0' }, skip: 1, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }] }),
    );
  });

  it('paginates an asset transfer history after checking asset scope', async () => {
    const { service, prisma } = setup();
    prisma.asset.findUnique.mockResolvedValue({ organizationalUnit: { ouPath: '/root/it' } } as never);
    prisma.assetTransfer.findMany.mockResolvedValue([transferRow('tr-1'), transferRow('tr-2')] as never);

    const result = await service.forAsset('asset-1', viewer, { cursor: 'tr-0', limit: 1 });

    expect(result).toMatchObject({ items: [{ id: 'tr-1' }], hasMore: true, nextCursor: 'tr-1' });
    expect(prisma.assetTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { items: { some: { assetId: 'asset-1' } } },
        take: 2,
        cursor: { id: 'tr-0' },
        skip: 1,
      }),
    );
  });
});
