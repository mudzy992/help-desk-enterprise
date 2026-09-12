import { createInMemorySlaPrisma } from './create-in-memory-sla-prisma';
import { createSlaProfile } from './create-sla-profile';
import { createSlaRule } from './create-sla-rule';
import {
  defaultSlaConfiguration,
  slaChangeReason,
} from './create-sla-service-harness';
import { seedStartingSlaProfiles } from './seed-starting-sla-profiles';
import {
  startingSlaCalendarKey,
  startingSlaProfileKeys,
} from './starting-sla.constants';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketPriority } from '../../generated/prisma/enums';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const businessDayMinutes = 8 * 60;
const expectedTargets: Record<
  (typeof startingSlaProfileKeys)[number],
  Record<TicketPriority, readonly [number, number]>
> = {
  INCIDENT: {
    CRITICAL: [10, 2 * 60],
    HIGH: [30, 4 * 60],
    MEDIUM: [2 * 60, businessDayMinutes],
    LOW: [4 * 60, 3 * businessDayMinutes],
  },
  ACCESS: {
    CRITICAL: [30, 8 * 60],
    HIGH: [2 * 60, 2 * businessDayMinutes],
    MEDIUM: [businessDayMinutes, 5 * businessDayMinutes],
    LOW: [2 * businessDayMinutes, 10 * businessDayMinutes],
  },
  STANDARD_REQUEST: {
    CRITICAL: [15, 4 * 60],
    HIGH: [60, 8 * 60],
    MEDIUM: [4 * 60, 3 * businessDayMinutes],
    LOW: [businessDayMinutes, 10 * businessDayMinutes],
  },
  FINANCE: {
    CRITICAL: [60, businessDayMinutes],
    HIGH: [4 * 60, 3 * businessDayMinutes],
    MEDIUM: [businessDayMinutes, 7 * businessDayMinutes],
    LOW: [2 * businessDayMinutes, 15 * businessDayMinutes],
  },
  HR: {
    CRITICAL: [4 * 60, 2 * businessDayMinutes],
    HIGH: [businessDayMinutes, 5 * businessDayMinutes],
    MEDIUM: [2 * businessDayMinutes, 10 * businessDayMinutes],
    LOW: [5 * businessDayMinutes, 20 * businessDayMinutes],
  },
};

function prismaFrom(memory: ReturnType<typeof createInMemorySlaPrisma>) {
  return memory.prisma as unknown as PrismaService;
}

describe('seedStartingSlaProfiles', () => {
  it('creates BH_STANDARD and all five RAW profiles with converted BH minutes', async () => {
    const prisma = prismaFrom(createInMemorySlaPrisma());
    const seeded = await seedStartingSlaProfiles(prisma);
    expect(seeded.calendarKey).toBe(startingSlaCalendarKey);
    expect(seeded.calendarCreated).toBe(true);
    expect(seeded.profiles.map((profile) => profile.key)).toEqual([
      ...startingSlaProfileKeys,
    ]);
    const calendar = await prisma.businessHoursCalendar.findUnique({
      where: { key: startingSlaCalendarKey },
    });
    expect(calendar).toMatchObject({
      key: 'BH_STANDARD',
      timezone: 'Europe/Sarajevo',
      isActive: true,
    });
    expect(calendar?.weeklyHours).toMatchObject({
      '1': [{ start: '08:00', end: '16:00' }],
      '5': [{ start: '08:00', end: '16:00' }],
    });
    for (const key of startingSlaProfileKeys) {
      await expectProfileMatchesRaw(prisma, key, seeded.calendarId);
    }
  });

  it('is idempotent and does not duplicate profiles or default rules', async () => {
    const prisma = prismaFrom(createInMemorySlaPrisma());
    const first = await seedStartingSlaProfiles(prisma);
    const second = await seedStartingSlaProfiles(prisma);
    expect(second.calendarCreated).toBe(false);
    expect(second.calendarId).toBe(first.calendarId);
    expect(second.profiles).toEqual(
      first.profiles.map((profile) => ({
        ...profile,
        created: false,
        createdRuleCount: 0,
      })),
    );
    expect(await prisma.slaProfile.findMany()).toHaveLength(5);
    for (const profile of second.profiles) {
      expect(
        await prisma.slaRule.findMany({ where: { slaProfileId: profile.id } }),
      ).toHaveLength(4);
    }
  });

  it('keeps existing profile rules and calendar relations', async () => {
    const memory = createInMemorySlaPrisma();
    const prisma = prismaFrom(memory);
    memory.seedService({ id: 'service-vpn', name: 'VPN access' });
    const first = await seedStartingSlaProfiles(prisma);
    const incidentId = first.profiles.find((item) => item.key === 'INCIDENT')?.id;
    const defaultHigh = (
      await prisma.slaRule.findMany({
        where: { slaProfileId: incidentId, priority: 'HIGH' },
      })
    ).find((rule) => rule.serviceId === null);
    await prisma.slaRule.update({
      where: { id: defaultHigh?.id ?? '' },
      data: { responseMinutes: 99, resolutionMinutes: 999 },
    });
    const custom = await createSlaRule(
      prisma,
      {
        slaProfileId: incidentId ?? '',
        priority: 'CRITICAL',
        responseMinutes: 5,
        resolutionMinutes: 9,
        serviceId: 'service-vpn',
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
      defaultSlaConfiguration,
    );
    const extra = await createSlaProfile(
      prisma,
      {
        key: 'CUSTOM_PACK',
        name: 'Custom pack',
        calendarId: first.calendarId,
        reason: slaChangeReason,
      },
      { actorUserId: 'admin-1' },
    );
    await seedStartingSlaProfiles(prisma);
    expect(
      await prisma.slaRule.findMany({
        where: { slaProfileId: incidentId, priority: 'HIGH' },
      }),
    ).toEqual([
      expect.objectContaining({
        id: defaultHigh?.id,
        responseMinutes: 99,
        resolutionMinutes: 999,
      }),
    ]);
    expect(
      await prisma.slaRule.findMany({
        where: { slaProfileId: incidentId, priority: 'CRITICAL' },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: custom.id, serviceId: 'service-vpn' }),
        expect.objectContaining({ serviceId: null, responseMinutes: 10 }),
      ]),
    );
    expect(await prisma.slaProfile.findUnique({ where: { id: extra.id } })).toMatchObject({
      key: 'CUSTOM_PACK',
      calendarId: first.calendarId,
    });
  });
});

async function expectProfileMatchesRaw(
  prisma: PrismaService,
  key: (typeof startingSlaProfileKeys)[number],
  calendarId: string,
): Promise<void> {
  const profile = await prisma.slaProfile.findUnique({ where: { key } });
  expect(profile).toMatchObject({ key, calendarId, isActive: true });
  const rules = await prisma.slaRule.findMany({
    where: { slaProfileId: profile?.id },
  });
  expect(rules).toHaveLength(4);
  for (const [priority, minutes] of Object.entries(expectedTargets[key])) {
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priority,
          responseMinutes: minutes[0],
          resolutionMinutes: minutes[1],
          organizationalUnitId: null,
          serviceId: null,
        }),
      ]),
    );
  }
}
