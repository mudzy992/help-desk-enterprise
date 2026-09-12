import { standardWeeklyHours } from '../sla/sla.constants';
import {
  createTicketsServiceHarness,
  ticketsTestIds,
} from './create-tickets-service-harness';

export async function seedTicketsSlaTimers(
  harness: ReturnType<typeof createTicketsServiceHarness>,
) {
  harness.slaConfig.enabled = true;
  await harness.routing.createRule({
    originUnitId: ticketsTestIds.ouIt,
    serviceId: ticketsTestIds.serviceVpn,
    groupId: ticketsTestIds.groupIt,
    reason: 'IT VPN coverage',
  });
  const calendar = await harness.memory.prisma.businessHoursCalendar.create({
    data: {
      key: 'BH_STANDARD',
      name: 'BH Standard',
      timezone: 'Europe/Sarajevo',
      weeklyHours: standardWeeklyHours,
      isActive: true,
    },
  });
  const profile = await harness.memory.prisma.slaProfile.create({
    data: {
      key: 'STANDARD_REQUEST',
      name: 'Standard request',
      description: null,
      calendarId: calendar.id,
      isActive: true,
    },
  });
  await harness.memory.prisma.slaRule.create({
    data: {
      slaProfileId: profile.id,
      priority: 'HIGH',
      responseMinutes: 60,
      resolutionMinutes: 240,
      evaluationOrder: 100,
      organizationalUnitId: null,
      serviceId: null,
    },
  });
  harness.memory.bindServiceSlaProfile(ticketsTestIds.serviceVpn, profile.id);
}
