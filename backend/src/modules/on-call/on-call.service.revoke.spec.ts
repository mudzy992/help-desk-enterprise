import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { OnCallService } from './on-call.service';
import type { OnCallViewer } from './on-call-viewer';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

const viewer: OnCallViewer = {
  userId: 'agent-1',
  canRead: true,
  canManage: false,
  readScope: { global: true, organizationalUnitPaths: [] },
  manageScope: { global: false, organizationalUnitPaths: [] },
};

function createHarness(options: { deletedCount: number; auditFails?: boolean }) {
  const auditCreate = jest.fn(async () => {
    if (options.auditFails) throw new Error('audit write failed');
    return {};
  });
  const txDeleteMany = jest.fn(async () => ({ count: options.deletedCount }));
  const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      onCallCalendarToken: { deleteMany: txDeleteMany },
      auditLog: { create: auditCreate, findFirst: jest.fn(async () => null) },
      $executeRaw: jest.fn(async () => 0),
    }),
  );
  const outerDeleteMany = jest.fn(async () => ({ count: options.deletedCount }));
  const prisma = {
    $transaction: transaction,
    onCallCalendarToken: { deleteMany: outerDeleteMany },
  };
  const settings = { getSetting: jest.fn(async () => true) };
  const service = new OnCallService(prisma as unknown as PrismaService, settings as unknown as SettingsService);
  return { service, transaction, txDeleteMany, auditCreate, outerDeleteMany };
}

describe('OnCallService.revokeCalendarToken (BA-on-call-12)', () => {
  it('deletes and audits inside one transaction, never on the outer client', async () => {
    const harness = createHarness({ deletedCount: 1 });
    await harness.service.revokeCalendarToken(viewer);
    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.txDeleteMany).toHaveBeenCalledWith({ where: { userId: 'agent-1' } });
    expect(harness.auditCreate).toHaveBeenCalledTimes(1);
    expect(harness.outerDeleteMany).not.toHaveBeenCalled();
  });

  it('propagates an audit failure so the transaction rolls the delete back', async () => {
    const harness = createHarness({ deletedCount: 1, auditFails: true });
    await expect(harness.service.revokeCalendarToken(viewer)).rejects.toThrow('audit write failed');
  });

  it('writes no audit entry when there was no token to revoke', async () => {
    const harness = createHarness({ deletedCount: 0 });
    await harness.service.revokeCalendarToken(viewer);
    expect(harness.txDeleteMany).toHaveBeenCalledTimes(1);
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });
});
