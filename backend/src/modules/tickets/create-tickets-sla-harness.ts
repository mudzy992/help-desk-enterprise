import { TicketSlaTimersService } from '../sla/ticket-sla-timers.service';

export function createTicketsSlaHarness(prisma: unknown) {
  const slaConfig = {
    enabled: false,
    requireReason: true,
    allowServiceOverrides: true,
    allowOuOverrides: true,
    pauseOnWaitingForUser: true,
    pauseOnPendingApproval: true,
    escalationsEnabled: true,
  };
  const slaTimers = new TicketSlaTimersService(prisma as never, {
    load: async () => slaConfig,
  } as never);
  return { slaConfig, slaTimers };
}
