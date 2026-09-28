jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../notifications/email/load-email-channel-configuration', () => ({ loadEmailChannelConfiguration: jest.fn() }));
jest.mock('../../notifications/email/deliver-notification-email', () => ({ deliverNotificationEmail: jest.fn() }));
jest.mock('./compose-privacy-email', () => ({
  ...jest.requireActual('./compose-privacy-email'),
  composePrivacyEmail: jest.fn(() => ({ subject: 's', text: 't', html: 'h', messageId: 'm', headers: {} })),
}));

import { loadEmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import { deliverNotificationEmail } from '../../notifications/email/deliver-notification-email';
import { composePrivacyEmail } from './compose-privacy-email';
import { PrivacyMailer } from './privacy-mailer.service';

const channel = {
  deliveryEnabled: true,
  smtp: { host: 'h' },
  presentation: { supportedLocales: ['bs', 'en'], defaultLocale: 'bs', fallbackLocale: 'bs' },
};
const monday0700 = new Date('2026-09-28T05:00:00Z');

function setup() {
  const prisma = {
    retentionRun: {
      findMany: jest.fn(async () => [
        { category: 'sessions', itemCount: 40, status: 'SUCCEEDED' },
        { category: 'sessions', itemCount: 2, status: 'PARTIAL' },
        { category: 'emailDeliveries', itemCount: 7, status: 'SUCCEEDED' },
      ]),
    },
    user: { findMany: jest.fn(async () => [{ id: 'u1', email: 'dpo@x.ba', displayName: 'DPO', preferredLocale: 'en' }]) },
    privacyErasure: { findUnique: jest.fn() },
    reportSchedule: { findMany: jest.fn() },
  };
  return { prisma, mailer: new PrivacyMailer(prisma as never, {} as never, {} as never) };
}

describe('PrivacyMailer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValue(channel);
    (deliverNotificationEmail as jest.Mock).mockResolvedValue(undefined);
  });

  it('weekly: aggregates last week per category, flags PARTIAL, dedupes on the slot', async () => {
    const { prisma, mailer } = setup();
    expect(await mailer.sendRetentionWeekly('Europe/Sarajevo', new Date(monday0700.getTime() + 15 * 60_000))).toBe(1);
    const where = (prisma.retentionRun.findMany.mock.calls[0] as unknown as [{ where: { startedAt: { gte: Date; lt: Date } } }])[0].where;
    expect(where.startedAt).toEqual({ gte: new Date('2026-09-21T05:00:00Z'), lt: monday0700 });
    const input = (composePrivacyEmail as jest.Mock).mock.calls[0][0];
    expect(input.locale).toBe('en');
    expect(input.dedupeKey).toBe('privacy-retention-weekly:2026-09-28T05:00:00.000Z');
    expect(input.tables[0].rows.map((r: { cells: string[] }) => r.cells.slice(1))).toEqual([['42', '2'], ['7', '1']]);
    expect(input.notes).toHaveLength(1);
    expect((deliverNotificationEmail as jest.Mock).mock.calls[0][3]).toMatchObject({ toAddress: 'dpo@x.ba', templateKey: 'privacy.retention_weekly' });
  });

  it('weekly: silent after the slot day, when nothing was deleted, or when e-mail is off', async () => {
    const { prisma, mailer } = setup();
    // Sunday: the slot is last Monday, more than a day ago.
    expect(await mailer.sendRetentionWeekly('Europe/Sarajevo', new Date('2026-09-27T12:00:00Z'))).toBe(0);
    expect(prisma.retentionRun.findMany).not.toHaveBeenCalled();
    prisma.retentionRun.findMany.mockResolvedValueOnce([]);
    expect(await mailer.sendRetentionWeekly('Europe/Sarajevo', monday0700)).toBe(0);
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValueOnce({ ...channel, deliveryEnabled: false });
    expect(await mailer.sendRetentionWeekly('Europe/Sarajevo', monday0700)).toBe(0);
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
  });

  it('erasure: requester and approver, English pseudonym, failures are swallowed', async () => {
    const { prisma, mailer } = setup();
    prisma.privacyErasure.findUnique.mockResolvedValue({
      status: 'COMPLETED', pseudonym: 'Bivši korisnik #7F3A', report: { tickets: 2 }, requestedByUserId: 'a', approvedByUserId: 'b',
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', email: 'a@x', displayName: 'A', preferredLocale: 'en' },
      { id: 'b', email: 'b@x', displayName: 'B', preferredLocale: 'bs' },
    ]);
    (deliverNotificationEmail as jest.Mock).mockRejectedValueOnce(new Error('smtp down'));
    expect(await mailer.sendErasureCompleted('e1')).toBe(1);
    const names = (composePrivacyEmail as jest.Mock).mock.calls.map((c) => c[0].variables.reportName);
    expect(names).toEqual(['Former user #7F3A', 'Bivši korisnik #7F3A']);
    expect((composePrivacyEmail as jest.Mock).mock.calls[0][0].dedupeKey).toBe('privacy-erasure-completed:e1');
  });

  it('paused schedules: owner only, skipped when the owner is gone', async () => {
    const { prisma, mailer } = setup();
    const updatedAt = new Date('2026-09-28T01:00:00Z');
    prisma.reportSchedule.findMany.mockResolvedValue([
      { id: 's1', name: 'Mjesečni', updatedAt, createdBy: { id: 'o', email: 'o@x', displayName: 'O', preferredLocale: null, isActive: true, anonymizedAt: null } },
      { id: 's2', name: 'X', updatedAt, createdBy: { id: 'p', email: 'p@x', displayName: 'P', preferredLocale: null, isActive: false, anonymizedAt: null } },
    ]);
    expect(await mailer.sendSchedulesPaused(['s1', 's2'])).toBe(1);
    expect((composePrivacyEmail as jest.Mock).mock.calls[0][0]).toMatchObject({
      key: 'report.schedule_paused', variables: { reportName: 'Mjesečni' }, dedupeKey: `report-schedule-paused:s1:${updatedAt.toISOString()}`,
    });
  });
});
