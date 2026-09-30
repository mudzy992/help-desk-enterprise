import { settingKeys } from '../../settings/setting-keys';
import { AssetRemindersService } from './asset-reminders.service';

jest.mock('../../notifications/fan-out/persist-in-app-notification', () => ({
  persistInAppNotification: jest.fn().mockResolvedValue({ id: 'n1' }),
}));
jest.mock('../../notifications/preferences/resolve-delivery-decisions', () => ({
  resolveDeliveryDecisions: jest.fn().mockResolvedValue(new Map()),
}));

const { persistInAppNotification } = jest.requireMock('../../notifications/fan-out/persist-in-app-notification') as {
  persistInAppNotification: jest.Mock;
};

const now = new Date('2026-10-01T08:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);

function role(key: string, permissions: string[], ouPath: string | null) {
  return {
    organizationalUnit: ouPath === null ? null : { ouPath },
    role: { key, rolePermissions: permissions.map((permission) => ({ permission: { key: permission } })) },
  };
}

function build(settings: Record<string, unknown>) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    asset: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'a1',
          assetTag: 'PC-1',
          name: 'Laptop',
          warrantyEndsAt: inDays(6),
          warrantyRemindersSent: [],
          organizationalUnit: { name: 'Sarajevo', ouPath: '/root/sa' },
        },
      ]),
      update,
    },
    assetContract: { findMany: jest.fn().mockResolvedValue([]), update },
    softwareLicense: { findMany: jest.fn().mockResolvedValue([]), update },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u-in', email: 'in@example.com', displayName: 'In', preferredLocale: 'bs', organizationalUnit: null, userRoles: [role('AGENT', ['asset.manage'], '/root')] },
        { id: 'u-out', email: 'out@example.com', displayName: 'Out', preferredLocale: 'bs', organizationalUnit: null, userRoles: [role('AGENT', ['asset.manage'], '/root/mo')] },
        { id: 'u-lic', email: 'lic@example.com', displayName: 'Lic', preferredLocale: 'bs', organizationalUnit: null, userRoles: [role('ASSET_MANAGER', ['asset.license.manage'], '/root')] },
        { id: 'u-admin', email: 'admin@example.com', displayName: 'Admin', preferredLocale: 'en', organizationalUnit: null, userRoles: [role('ADMIN', [], null)] },
      ]),
    },
    $transaction: jest.fn().mockImplementation((operations: unknown[]) => Promise.all(operations)),
  };
  const settingsService = { getSetting: jest.fn(async (key: string) => settings[key]) };
  const mail = { send: jest.fn() };
  const service = new AssetRemindersService(prisma as never, settingsService as never, mail as never);
  return { service, prisma, update };
}

describe('AssetRemindersService (paket 3.2 §10)', () => {
  beforeEach(() => persistInAppNotification.mockClear());

  it('does nothing while the module is off', async () => {
    const { service, prisma } = build({});
    await expect(service.run(now)).resolves.toMatchObject({ skipped: 'module_disabled' });
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('notifies only managers whose scope and permission cover the item, then records the threshold', async () => {
    const { service, update } = build({ [settingKeys.privateAddonsCmdb]: true, [settingKeys.privateAssetsRemindersDaysBefore]: '30,7' });
    const result = await service.run(now, { ignoreHour: true });
    expect(result).toMatchObject({ skipped: null, items: 1, recipients: 2, inApp: 2 });
    const notified = persistInAppNotification.mock.calls.map(([, input]) => (input as { userId: string }).userId).sort();
    // u-out: other branch; u-lic: licence permission does not cover warranties.
    expect(notified).toEqual(['u-admin', 'u-in']);
    // Both crossed thresholds are recorded, so the 30-day reminder is not sent late.
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { warrantyRemindersSent: [30, 7] } });
  });
});
