import { ConflictException } from '@nestjs/common';
import {
  createSlaServiceHarness,
  slaChangeReason,
  standardWeeklyHours,
} from './create-sla-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SlaCalendarsService', () => {
  it('creates, updates, and lists calendars with holidays', async () => {
    const { calendars } = createSlaServiceHarness();
    const created = await calendars.create(
      {
        key: 'bh-standard',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        holidays: [{ date: '2026-01-01', name: 'Nova godina' }],
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    expect(created).toMatchObject({
      key: 'BH_STANDARD',
      timezone: 'Europe/Sarajevo',
      isActive: true,
    });
    expect(created.holidays).toEqual([
      expect.objectContaining({ date: '2026-01-01', name: 'Nova godina' }),
    ]);
    const updated = await calendars.update(
      created.id,
      {
        name: 'BH Standard (rev)',
        holidays: [{ date: '2026-03-01', name: 'Nezavisnost' }],
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    expect(updated.name).toBe('BH Standard (rev)');
    expect(updated.holidays.map((holiday) => holiday.date)).toEqual(['2026-03-01']);
    expect(await calendars.list()).toHaveLength(1);
  });

  it('rejects overlapping weekly hours and duplicate keys', async () => {
    const { calendars } = createSlaServiceHarness();
    await calendars.create(
      {
        key: 'BH_STANDARD',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await expect(
      calendars.create(
        {
          key: 'BH_STANDARD',
          name: 'Copy',
          timezone: 'Europe/Sarajevo',
          weeklyHours: standardWeeklyHours,
          reason: slaChangeReason,
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      calendars.create(
        {
          key: 'NIGHT',
          name: 'Night',
          timezone: 'Europe/Sarajevo',
          weeklyHours: {
            '1': [
              { start: '08:00', end: '12:00' },
              { start: '11:30', end: '16:00' },
            ],
          },
          reason: slaChangeReason,
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toMatchObject({ response: { code: 'OVERLAPPING_INTERVALS' } });
  });
});
