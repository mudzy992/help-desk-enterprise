import { BadRequestException, ConflictException } from '@nestjs/common';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import {
  createSlaServiceHarness,
  slaChangeReason,
  standardWeeklyHours,
} from './create-sla-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SLA change log', () => {
  it('records actor, reason, and before/after for calendar, profile, and rule mutations', async () => {
    const { calendars, profiles, rules, memory } = createSlaServiceHarness();
    const calendar = await calendars.create(
      {
        key: 'BH_STANDARD',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    const profile = await profiles.create(
      {
        key: 'INCIDENT',
        name: 'Incident',
        calendarId: calendar.id,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await rules.create(
      {
        slaProfileId: profile.id,
        priority: 'CRITICAL',
        responseMinutes: 15,
        resolutionMinutes: 240,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    expect(memory.changeLogs.map((entry) => entry.entityType)).toEqual([
      changeLogEntityTypes.businessHoursCalendar,
      changeLogEntityTypes.slaProfile,
      changeLogEntityTypes.slaRule,
    ]);
    expect(memory.changeLogs.every((entry) => entry.reason === slaChangeReason)).toBe(
      true,
    );
    expect(memory.changeLogs.every((entry) => entry.actorUserId === 'admin-1')).toBe(
      true,
    );
    const profileLog = memory.changeLogs[1];
    expect(profileLog?.diff.changes.some((item) => item.path === 'key')).toBe(true);
  });

  it('requires a reason and does not log failed mutations', async () => {
    const { calendars, memory } = createSlaServiceHarness();
    await expect(
      calendars.create(
        {
          key: 'BH_STANDARD',
          name: 'BH Standard',
          timezone: 'Europe/Sarajevo',
          weeklyHours: standardWeeklyHours,
          reason: '  ',
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(memory.changeLogs).toEqual([]);
  });

  it('refuses to delete a calendar that still has profiles', async () => {
    const { calendars, profiles } = createSlaServiceHarness();
    const calendar = await calendars.create(
      {
        key: 'BH_STANDARD',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await profiles.create(
      {
        key: 'INCIDENT',
        name: 'Incident',
        calendarId: calendar.id,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await expect(
      calendars.delete(calendar.id, slaChangeReason, { actorUserId: 'admin-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
