import { PrismaService } from '../../common/prisma/prisma.service';
import { addBusinessMinutes } from './add-business-minutes';
import type { BusinessMinutesCalendar } from './business-hours-civil-time';
import { resolveMatchingSlaRule } from './resolve-matching-sla-rule';
import type { SlaRuleRecord } from './sla.types';
import type { TicketSlaStateRecord, TicketSlaTicketRef } from './ticket-sla.types';

/**
 * Package 1.2 (plan §3 P5): after a priority change the targets are measured
 * again from the original start (ITIL: the clock runs from the report, not
 * from the change), with the already accumulated pause added back.
 *
 * - A recorded breach stays recorded (lowering the priority never erases it):
 *   `evaluateTicketSlaBreach` only ever turns the flags on.
 * - A met response keeps its target; only the resolution target moves.
 * - Fired escalations are kept, so none is fired twice.
 * - No matching rule for the new priority → the state is left as it was.
 */
export async function recomputeTicketSlaTargets(
  prisma: PrismaService,
  state: TicketSlaStateRecord,
  ticket: TicketSlaTicketRef,
  calendar: BusinessMinutesCalendar | null,
): Promise<TicketSlaStateRecord> {
  if (state.slaProfileId === null || calendar === null) {
    return state;
  }
  const rules = (await prisma.slaRule.findMany({
    where: { slaProfileId: state.slaProfileId },
  })) as SlaRuleRecord[];
  const rule = resolveMatchingSlaRule(rules, {
    priority: ticket.priority,
    serviceId: ticket.serviceId,
    organizationalUnitId: ticket.originUnitId,
  });
  if (rule === null) {
    return state;
  }
  return applyRecomputedSlaRule(state, rule, calendar);
}

export function applyRecomputedSlaRule(
  state: TicketSlaStateRecord,
  rule: Pick<SlaRuleRecord, 'id' | 'responseMinutes' | 'resolutionMinutes'>,
  calendar: BusinessMinutesCalendar,
): TicketSlaStateRecord {
  const due = (minutes: number) =>
    addBusinessMinutes(calendar, state.startedAt, minutes + state.pausedBusinessMinutes);
  const responded = state.respondedAt !== null;
  return {
    ...state,
    slaRuleId: rule.id,
    responseMinutes: responded ? state.responseMinutes : rule.responseMinutes,
    resolutionMinutes: rule.resolutionMinutes,
    responseDueAt: responded ? state.responseDueAt : due(rule.responseMinutes),
    resolutionDueAt:
      state.resolutionCompletedAt !== null ? state.resolutionDueAt : due(rule.resolutionMinutes),
    // Re-evaluated by the caller; a breach already recorded stays on.
    isResponseAtRisk: false,
    isResolutionAtRisk: false,
  };
}
