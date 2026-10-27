import { PrismaService } from '../../common/prisma/prisma.service';
import type { JsonValue } from '../change-log/change-log.types';
import { recordTicketSlaRuntimeEvent } from './record-ticket-sla-runtime-event';
import { parseSlaEscalationKey } from './select-due-sla-escalations';
import { defaultSlaEscalationRuleId, slaChangeLogReasons, slaSystemEventActions } from './sla.constants';
import type { SlaEscalationRuleRecord, TicketSlaStateRecord } from './ticket-sla.types';

type RuntimeMarks = Pick<
  TicketSlaStateRecord,
  | 'isResponseBreached'
  | 'isResolutionBreached'
  | 'isResponseAtRisk'
  | 'isResolutionAtRisk'
  | 'firedEscalationKeys'
>;

export type TicketSlaRuntimeEventIntent = {
  readonly ticketId: string;
  readonly reason: string;
  readonly action: string;
  readonly before: TicketSlaStateRecord;
  readonly after: TicketSlaStateRecord;
  readonly extraAfter?: { readonly [key: string]: JsonValue };
  readonly escalationRuleId?: string | null;
};

export const emptyTicketSlaRuntimeMarks: RuntimeMarks = {
  isResponseBreached: false,
  isResolutionBreached: false,
  isResponseAtRisk: false,
  isResolutionAtRisk: false,
  firedEscalationKeys: [],
};

export function collectTicketSlaRuntimeEventIntents(input: {
  readonly ticketId: string;
  readonly previous: RuntimeMarks;
  readonly next: TicketSlaStateRecord;
  readonly rules: readonly SlaEscalationRuleRecord[];
}): readonly TicketSlaRuntimeEventIntent[] {
  const intents: TicketSlaRuntimeEventIntent[] = [];
  const responseBreachesNow = !input.previous.isResponseBreached && input.next.isResponseBreached;
  const resolutionBreachesNow = !input.previous.isResolutionBreached && input.next.isResolutionBreached;
  if (!input.previous.isResponseAtRisk && input.next.isResponseAtRisk && !responseBreachesNow) {
    intents.push(intent(input, slaChangeLogReasons.responseAtRisk, slaSystemEventActions.responseAtRisk));
  }
  if (!input.previous.isResolutionAtRisk && input.next.isResolutionAtRisk && !resolutionBreachesNow) {
    intents.push(intent(input, slaChangeLogReasons.resolutionAtRisk, slaSystemEventActions.resolutionAtRisk));
  }
  if (responseBreachesNow) {
    intents.push(intent(input, slaChangeLogReasons.responseBreached, slaSystemEventActions.responseBreached));
  }
  if (resolutionBreachesNow) {
    intents.push(intent(input, slaChangeLogReasons.resolutionBreached, slaSystemEventActions.resolutionBreached));
  }
  const previousKeys = new Set(input.previous.firedEscalationKeys);
  for (const key of input.next.firedEscalationKeys) {
    if (previousKeys.has(key)) continue;
    const parsed = parseSlaEscalationKey(key);
    if (parsed === null) continue;
    const rule = findRule(input.rules, parsed.ruleId, input.next);
    intents.push({
      ...intent(
        input,
        parsed.kind === 'response' ? slaChangeLogReasons.responseEscalated : slaChangeLogReasons.resolutionEscalated,
        parsed.kind === 'response' ? slaSystemEventActions.responseEscalated : slaSystemEventActions.resolutionEscalated,
      ),
      before: { ...input.next, firedEscalationKeys: [...previousKeys] },
      escalationRuleId: rule.id,
      extraAfter: {
        kind: parsed.kind,
        slaEscalationRuleId: rule.id,
        targetGroupId: rule.targetGroupId,
        targetRole: rule.targetRole,
        targetUserId: rule.targetUserId,
        triggerOffsetMinutes: rule.triggerOffsetMinutes,
      },
    });
  }
  return intents;
}

export async function emitTicketSlaRuntimeEvents(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly previous: RuntimeMarks;
    readonly next: TicketSlaStateRecord;
    readonly rules: readonly SlaEscalationRuleRecord[];
  },
): Promise<void> {
  for (const event of collectTicketSlaRuntimeEventIntents(input)) {
    await recordTicketSlaRuntimeEvent(prisma, event);
  }
}

function intent(
  input: { readonly ticketId: string; readonly previous: RuntimeMarks; readonly next: TicketSlaStateRecord },
  reason: string,
  action: string,
): TicketSlaRuntimeEventIntent {
  return {
    ticketId: input.ticketId,
    reason,
    action,
    before: { ...input.next, ...input.previous },
    after: input.next,
  };
}

function findRule(
  rules: readonly SlaEscalationRuleRecord[],
  ruleId: string,
  state: TicketSlaStateRecord,
): SlaEscalationRuleRecord {
  const match = rules.find((rule) => rule.id === ruleId);
  if (match !== undefined) return match;
  return {
    id: ruleId === defaultSlaEscalationRuleId ? defaultSlaEscalationRuleId : ruleId,
    slaProfileId: state.slaProfileId ?? '',
    triggerOffsetMinutes: 0,
    targetGroupId: null,
    targetRole: null,
    targetUserId: null,
  };
}
