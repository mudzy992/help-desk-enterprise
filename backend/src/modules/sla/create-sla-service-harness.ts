import { SlaCalendarsService } from './sla-calendars.service';
import { SlaProfilesService } from './sla-profiles.service';
import { SlaRulesService } from './sla-rules.service';
import { createInMemorySlaPrisma } from './create-in-memory-sla-prisma';
import type { SlaConfiguration } from './sla.types';

export { standardWeeklyHours } from './sla.constants';

export const slaChangeReason = 'Align BH calendar and SLA targets with operations';

export const defaultSlaConfiguration: SlaConfiguration = {
  enabled: true,
  requireReason: true,
  allowServiceOverrides: true,
  allowOuOverrides: true,
  pauseOnWaitingForUser: true,
  pauseOnPendingApproval: true,
  notifyBeforeOverdueMinutes: 30,
  escalationsEnabled: true,
  maxEscalationLevels: 3,
};

export function createSlaServiceHarness(
  configuration: SlaConfiguration = defaultSlaConfiguration,
) {
  const memory = createInMemorySlaPrisma();
  const prisma = memory.prisma as never;
  const calendars = new SlaCalendarsService(prisma);
  const profiles = new SlaProfilesService(prisma);
  const rules = new SlaRulesService(prisma, {
    load: async () => configuration,
  } as never);
  memory.seedUnit({ id: 'ou-it', ouPath: '/Korisnici/Direkcija/IT' });
  memory.seedService({ id: 'service-vpn', name: 'VPN access' });
  memory.seedUser({ id: 'admin-1', displayName: 'Admin One' });
  return { memory, calendars, profiles, rules };
}
