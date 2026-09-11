import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  createSlaServiceHarness,
  slaChangeReason,
  standardWeeklyHours,
} from './create-sla-service-harness';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SlaRulesService', () => {
  async function seedProfile() {
    const harness = createSlaServiceHarness();
    const calendar = await harness.calendars.create(
      {
        key: 'BH_STANDARD',
        name: 'BH Standard',
        timezone: 'Europe/Sarajevo',
        weeklyHours: standardWeeklyHours,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    const profile = await harness.profiles.create(
      {
        key: 'STANDARD_REQUEST',
        name: 'Standard request',
        calendarId: calendar.id,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    return { ...harness, calendar, profile };
  }

  it('rejects duplicate match keys and invalid targets', async () => {
    const { rules, profile } = await seedProfile();
    await rules.create(
      {
        slaProfileId: profile.id,
        priority: 'HIGH',
        responseMinutes: 60,
        resolutionMinutes: 480,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await expect(
      rules.create(
        {
          slaProfileId: profile.id,
          priority: 'HIGH',
          responseMinutes: 30,
          resolutionMinutes: 240,
          reason: slaChangeReason,
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      rules.create(
        {
          slaProfileId: profile.id,
          priority: 'LOW',
          responseMinutes: 480,
          resolutionMinutes: 60,
          reason: slaChangeReason,
        },
        { actorUserId: 'admin-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('evaluates rules by order then specificity and computes BH due dates', async () => {
    const { rules, profile } = await seedProfile();
    await rules.create(
      {
        slaProfileId: profile.id,
        priority: 'CRITICAL',
        responseMinutes: 60,
        resolutionMinutes: 240,
        evaluationOrder: 20,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    const specific = await rules.create(
      {
        slaProfileId: profile.id,
        priority: 'CRITICAL',
        responseMinutes: 15,
        resolutionMinutes: 120,
        evaluationOrder: 10,
        serviceId: 'service-vpn',
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    const resolved = await rules.resolveTargets({
      slaProfileId: profile.id,
      priority: 'CRITICAL',
      serviceId: 'service-vpn',
      startedAt: '2026-09-07T06:00:00.000Z',
    });
    expect(resolved.slaRuleId).toBe(specific.id);
    expect(resolved.responseDueAt).toBe('2026-09-07T06:15:00.000Z');
    expect(resolved.resolutionDueAt).toBe('2026-09-07T08:00:00.000Z');
  });
});
