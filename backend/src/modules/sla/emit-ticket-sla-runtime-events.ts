import { PrismaService } from '../../common/prisma/prisma.service';
import { recordTicketSlaRuntimeEvent } from './record-ticket-sla-runtime-event';
import { parseSlaEscalationKey } from './select-due-sla-escalations';
import { defaultSlaEscalationRuleId, slaChangeLogReasons, slaSystemEventActions } from './sla.constants';
import type { SlaEscalationRuleRecord, TicketSlaStateRecord } from './ticket-sla.types';

type RuntimeMarks = Pick<
  TicketSlaStateRecord,
  'isResponseBreached' | 'isResolutionBreached' | 'firedEscalationKeys'
>;

export const emptyTicketSlaRuntimeMarks: RuntimeMarks = {
  isResponseBreached: false,
  isResolutionBreached: false,
  firedEscalationKeys: [],
};

export async function emitTicketSlaRuntimeEvents(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly previous: RuntimeMarks;
    readonly next: TicketSlaStateRecord;
    readonly rules: readonly SlaEscalationRuleRecord[];
  },
): Promise<void> {
  if (!input.previous.isResponseBreached && input.next.isResponseBreached) {
    await recordTicketSlaRuntimeEvent(prisma, {
      ticketId: input.ticketId,
      reason: slaChangeLogReasons.responseBreached,
      action: slaSystemEventActions.responseBreached,
      before: { ...input.next, ...input.previous },
      after: input.next,
    });
  }
  if (!input.previous.isResolutionBreached && input.next.isResolutionBreached) {
    await recordTicketSlaRuntimeEvent(prisma, {
      ticketId: input.ticketId,
      reason: slaChangeLogReasons.resolutionBreached,
      action: slaSystemEventActions.resolutionBreached,
      before: { ...input.next, ...input.previous },
      after: input.next,
    });
  }
  const previousKeys = new Set(input.previous.firedEscalationKeys);
  for (const key of input.next.firedEscalationKeys) {
    if (previousKeys.has(key)) {
      continue;
    }
    const parsed = parseSlaEscalationKey(key);
    if (parsed === null) {
      continue;
    }
    const rule = findRule(input.rules, parsed.ruleId, input.next);
    await recordTicketSlaRuntimeEvent(prisma, {
      ticketId: input.ticketId,
      reason:
        parsed.kind === 'response'
          ? slaChangeLogReasons.responseEscalated
          : slaChangeLogReasons.resolutionEscalated,
      action:
        parsed.kind === 'response'
          ? slaSystemEventActions.responseEscalated
          : slaSystemEventActions.resolutionEscalated,
      before: { ...input.next, firedEscalationKeys: [...previousKeys] },
      after: input.next,
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
}

function findRule(
  rules: readonly SlaEscalationRuleRecord[],
  ruleId: string,
  state: TicketSlaStateRecord,
): SlaEscalationRuleRecord {
  const match = rules.find((rule) => rule.id === ruleId);
  if (match !== undefined) {
    return match;
  }
  return {
    id: ruleId === defaultSlaEscalationRuleId ? defaultSlaEscalationRuleId : ruleId,
    slaProfileId: state.slaProfileId ?? '',
    triggerOffsetMinutes: 0,
    targetGroupId: null,
    targetRole: null,
    targetUserId: null,
  };
}
