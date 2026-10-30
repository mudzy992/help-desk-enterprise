import { assetErrorCodes } from '../assets.constants';
import type { AssetViewer } from '../asset-viewer';
import { AssetTransfersService, scrubAssetTransferSnapshots } from './asset-transfers.service';

const viewer: AssetViewer = {
  userId: 'agent',
  isSuperAdmin: false,
  homeOrganizationalUnitId: null,
  grants: [],
};

function transferMock() {
  const transaction = {
    $queryRaw: jest.fn(),
    assetTransfer: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'transfer-1' }),
    },
  };
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  const access = {
    require: jest.fn().mockResolvedValue({ all: true }),
    readSetting: jest.fn().mockResolvedValue(true),
    requireEnabled: jest.fn(),
    requireUnitInScope: jest.fn(),
    locationsEnabled: jest.fn().mockResolvedValue(false),
    scope: jest.fn().mockResolvedValue({ all: true }),
  };
  const settings = { getSetting: jest.fn().mockResolvedValue('Europe/Sarajevo') };
  const service = new AssetTransfersService(prisma as never, access as never, settings as never);
  return { service, prisma, transaction };
}

describe('asset-transfer anonymization and fail-closed signed-copy access', () => {
  it('scrubs related snapshots and text, nulls party references, and queues signed-file purge', async () => {
    const { transaction } = transferMock();
    const now = new Date('2026-10-01T00:00:00Z');
    transaction.$queryRaw.mockResolvedValueOnce([{ id: 'transfer-1' }]);
    transaction.assetTransfer.findMany.mockResolvedValueOnce([{
      id: 'transfer-1',
      snapshot: {
        version: 1,
        locale: 'bs',
        number: '26-0001-2026',
        scenario: 'WAREHOUSE_TO_USER',
        issuedAt: now.toISOString(),
        timeZone: 'Europe/Sarajevo',
        place: 'Amra office',
        from: { userId: 'user-1', name: 'Amra Hodžić', title: '', unit: '', email: 'amra@example.com' },
        to: { userId: null, name: 'Skladište', title: '', unit: '', email: '' },
        signatory: { userId: null, name: 'Edin', title: '', unit: '', email: '' },
        issuedBy: { userId: null, name: 'Admin', title: '', unit: '', email: '' },
        note: 'Za Amra Hodžić',
        items: [{
          assetId: 'asset-1',
          name: 'Laptop for Amra',
          assetTag: 'INV-1',
          serialNumber: 'SN-1',
          type: 'Laptop',
          manufacturer: 'Dell',
          model: 'XPS',
          location: 'Amra office',
          note: '',
        }],
      },
      fromUserId: 'user-1',
      toUserId: null,
      signatoryUserId: null,
      issuedByUserId: null,
      note: 'Amra Hodžić',
      fromLabel: 'Amra Hodžić',
      toLabel: null,
      cancelReason: null,
      signedFileName: 'amra-signed.pdf',
      signedStoragePath: 'assets/transfers/transfer-1/signed.pdf',
      signedFilePurgeRequestedAt: null,
      signedByUserId: 'user-1',
      cancelledByUserId: null,
    }]);

    const result = await scrubAssetTransferSnapshots(
      transaction as never,
      'user-1',
      'Bivši korisnik #AB12',
      (value) => value.replaceAll('Amra Hodžić', '[redacted]'),
    );

    expect(result).toMatchObject({ transfers: 1, signedFilesQueued: 1 });
    expect(transaction.$queryRaw.mock.calls[0][0].join(' ')).toContain('FOR UPDATE');
    const update = transaction.assetTransfer.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'transfer-1' });
    expect(update.data).toMatchObject({
      fromUserId: null,
      signedByUserId: null,
      signedFileName: null,
      signedFilePurgeRequestedAt: expect.any(Date),
    });
    expect(update.data.snapshot).toMatchObject({
      from: { userId: null, name: 'Bivši korisnik #AB12', email: '' },
      place: 'Amra office',
      note: 'Za [redacted]',
      items: [{ name: 'Laptop for Amra' }],
    });
    expect(update.data.note).toBe('[redacted]');
    expect(update.data.fromLabel).toBe('[redacted]');
  });

  it('refuses signed-copy reads once the purge marker has committed', async () => {
    const { service, transaction } = transferMock();
    const internals = service as unknown as {
      loadVisible: jest.Mock;
      uploadRoot: jest.Mock;
    };
    jest.spyOn(internals, 'loadVisible').mockResolvedValue({ transfer: { id: 'transfer-1' } });
    jest.spyOn(internals, 'uploadRoot').mockReturnValue('/tmp/unused-transfer-root');
    transaction.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.signedCopy('transfer-1', viewer)).rejects.toMatchObject({
      code: assetErrorCodes.transferNoSignedCopy,
    });
    const sql = transaction.$queryRaw.mock.calls[0][0].join(' ');
    expect(sql).toContain('"signedFilePurgeRequestedAt" IS NULL');
    expect(sql).toContain('"retentionRedactedAt" IS NULL');
    expect(sql).toContain('FOR SHARE');
  });

  it('rejects signed-file replacement after anonymization or purge has started', async () => {
    const { service } = transferMock();
    const internals = service as unknown as { loadVisible: jest.Mock; requireManage: jest.Mock };
    jest.spyOn(internals, 'loadVisible').mockResolvedValue({
      transfer: {
        id: 'transfer-1',
        status: 'ISSUED',
        retentionRedactedAt: null,
        signedFilePurgeRequestedAt: new Date(),
      },
    });
    jest.spyOn(internals, 'requireManage').mockResolvedValue(undefined);

    await expect(
      service.uploadSigned('transfer-1', { fileName: 'signed.pdf', buffer: Buffer.from('file') }, viewer),
    ).rejects.toMatchObject({ code: assetErrorCodes.transferNotIssued });
  });

  it('rejects cancellation after anonymization or purge has started', async () => {
    const { service } = transferMock();
    const internals = service as unknown as { loadVisible: jest.Mock; requireManage: jest.Mock };
    jest.spyOn(internals, 'loadVisible').mockResolvedValue({
      transfer: {
        id: 'transfer-1',
        status: 'ISSUED',
        retentionRedactedAt: new Date(),
        signedFilePurgeRequestedAt: null,
      },
    });
    jest.spyOn(internals, 'requireManage').mockResolvedValue(undefined);

    await expect(service.cancel('transfer-1', 'reason', viewer)).rejects.toMatchObject({
      code: assetErrorCodes.transferNotIssued,
    });
  });
});
