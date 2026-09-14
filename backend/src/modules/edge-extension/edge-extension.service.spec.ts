import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { edgeExtensionDenyReasons } from './edge-extension.constants';
import { EdgeExtensionService } from './edge-extension.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../audit-log/record-audit-entry', () => ({
  recordAuditEntry: jest.fn(),
}));

describe('EdgeExtensionService', () => {
  const originalDeskUrl = process.env.APP_PUBLIC_URL;
  const getSetting = jest.fn();
  const notificationFindFirst = jest.fn();
  const auditFindFirst = jest.fn();
  const recordAudit = recordAuditEntry as jest.MockedFunction<
    typeof recordAuditEntry
  >;

  const principal = {
    subjectId: 'user-1',
    email: 'ana@epbih.ba',
    displayName: 'Ana',
    isLocalOnly: false,
  };

  const service = new EdgeExtensionService(
    {
      notification: { findFirst: notificationFindFirst },
      auditLog: { findFirst: auditFindFirst },
    } as unknown as PrismaService,
    { getSetting } as unknown as SettingsService,
  );

  beforeEach(() => {
    getSetting.mockReset();
    notificationFindFirst.mockReset();
    auditFindFirst.mockReset();
    recordAudit.mockReset();
    process.env.APP_PUBLIC_URL = 'https://desk.ba101.top/';
    getSetting.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        [settingKeys.privateAddonsEdge]: true,
        [settingKeys.privateEdgeExtensionEnabled]: true,
        [settingKeys.privateNotificationsEdgeEnabled]: true,
        [settingKeys.privateEdgeExtensionKillSwitchEnabled]: false,
        [settingKeys.privateEdgeExtensionWsEnabled]: true,
        [settingKeys.privateEdgeExtensionWsReconnectMaxBackoffSeconds]: 60,
        [settingKeys.privateEdgeExtensionWsMinClientVersion]: '',
        [settingKeys.privateEdgeExtensionNotificationsRedactedPreviews]: true,
        [settingKeys.privateEdgeExtensionReceiptsEnabled]: true,
        [settingKeys.privateEdgeExtensionEventsDedupEnabled]: true,
        [settingKeys.privateEdgeExtensionPollingFallbackEnabled]: true,
        [settingKeys.privateEdgeExtensionPollingFallbackIntervalSeconds]: 90,
        [settingKeys.privateEdgeExtensionAllowedEmailDomain]: 'epbih.ba',
      };
      return Promise.resolve(values[key]);
    });
  });

  afterEach(() => {
    if (originalDeskUrl === undefined) {
      delete process.env.APP_PUBLIC_URL;
      return;
    }
    process.env.APP_PUBLIC_URL = originalDeskUrl;
  });

  it('denies bootstrap when the kill switch is engaged', async () => {
    getSetting.mockImplementation((key: string) => {
      if (key === settingKeys.privateEdgeExtensionKillSwitchEnabled) {
        return Promise.resolve(true);
      }
      if (key === settingKeys.privateAddonsEdge) {
        return Promise.resolve(true);
      }
      return Promise.resolve(true);
    });
    const result = await service.bootstrap(principal, '0.0.1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(edgeExtensionDenyReasons.killSwitch);
    expect(result.deskPublicUrl).toBe('https://desk.ba101.top');
  });

  it('records a delivered receipt and is idempotent', async () => {
    notificationFindFirst.mockResolvedValue({ id: 'notif-1' });
    auditFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'audit-1',
    });
    const first = await service.recordReceipt(principal, {
      notificationId: 'notif-1',
      kind: 'delivered',
      eventId: 'notif-1',
    });
    const second = await service.recordReceipt(principal, {
      notificationId: 'notif-1',
      kind: 'delivered',
      eventId: 'notif-1',
    });
    expect(first).toEqual({
      accepted: true,
      duplicate: false,
      kind: 'delivered',
      notificationId: 'notif-1',
      eventId: 'notif-1',
    });
    expect(second.duplicate).toBe(true);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it('rejects a receipt for another user notification', async () => {
    notificationFindFirst.mockResolvedValue(null);
    await expect(
      service.recordReceipt(principal, {
        notificationId: 'missing',
        kind: 'opened',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects receipts when the setting is off', async () => {
    getSetting.mockImplementation((key: string) => {
      if (key === settingKeys.privateEdgeExtensionReceiptsEnabled) {
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    });
    await expect(
      service.recordReceipt(principal, {
        notificationId: 'notif-1',
        kind: 'delivered',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
