import { BadRequestException } from '@nestjs/common';
import { ticketSlaSettings } from '../settings/definitions/ticket-sla-settings';
import { settingKeys } from '../settings/setting-keys';
import {
  createSlaServiceHarness,
  standardWeeklyHours,
} from './create-sla-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const removedSettingKey =
  'private.ticket.sla.requireAdminReasonForRuleChanges';

describe('SLA admin reason (always required)', () => {
  it('does not register the former requireAdminReasonForRuleChanges setting', () => {
    const registeredKeys: readonly string[] = Object.values(settingKeys);
    expect(registeredKeys.includes(removedSettingKey)).toBe(false);
    expect(
      ticketSlaSettings.some((definition) => definition.key === removedSettingKey),
    ).toBe(false);
  });

  it('rejects blank reason on calendar, profile, and rule mutations', async () => {
    const { calendars, profiles, rules, memory } = createSlaServiceHarness();
    const calendar = await calendars.create(
      {
        key: 'BH_STANDARD',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        reason: 'Seed calendar for reason checks',
      },
      { actorUserId: 'admin-1' },
    );
    await expect(
      calendars.create(
        {
          key: 'BH_BLANK_REASON',
          name: 'BH Blank',
          timezone: 'Europe/Sarajevo',
          weeklyHours: standardWeeklyHours,
          reason: '   ',
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      profiles.create(
        {
          key: 'PROFILE_BLANK_REASON',
          name: 'Blank reason profile',
          calendarId: calendar.id,
          reason: '',
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const profile = await profiles.create(
      {
        key: 'INCIDENT',
        name: 'Incident',
        calendarId: calendar.id,
        reason: 'Seed profile for reason checks',
      },
      { actorUserId: 'admin-1' },
    );
    await expect(
      rules.create(
        {
          slaProfileId: profile.id,
          priority: 'CRITICAL',
          responseMinutes: 15,
          resolutionMinutes: 240,
          reason: ' ',
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(memory.changeLogs).toHaveLength(2);
  });
});
