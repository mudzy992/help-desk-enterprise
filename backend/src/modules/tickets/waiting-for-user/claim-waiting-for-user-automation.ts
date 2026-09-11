import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import {
  automationFingerprint,
  claimGuardrailTrigger,
} from '../guardrails/claim-guardrail-trigger';
import { guardrailClaimKinds } from '../guardrails/guardrails.constants';
import type { TicketGuardrailsConfiguration } from '../guardrails/guardrails.types';
import { recordGuardrailLoopSuppressed } from '../guardrails/record-guardrail-warning';
import type { TicketRecord } from '../tickets.types';
import type { WaitingForUserAutomationAction } from './waiting-for-user.types';

export async function claimWaitingForUserAutomation(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly action: WaitingForUserAutomationAction;
  readonly guardrails: TicketGuardrailsConfiguration;
  readonly now: Date;
  readonly messages?: TicketPersistedMessageSink;
}): Promise<boolean> {
  if (input.action === 'none' || input.ticket.waitingForUserEnteredAt === null) {
    return false;
  }
  const decision = await claimGuardrailTrigger({
    prisma: input.prisma,
    configuration: input.guardrails,
    claim: {
      kind: guardrailClaimKinds.automation,
      subjectKey: input.ticket.id,
      fingerprint: automationFingerprint(
        input.action,
        input.ticket.waitingForUserEnteredAt.toISOString(),
      ),
      ticketId: input.ticket.id,
      now: input.now,
    },
  });
  if (decision.allowed) {
    return true;
  }
  if (decision.reason === 'loop') {
    await recordGuardrailLoopSuppressed({
      prisma: input.prisma,
      ticket: input.ticket,
      action: `waiting_for_user_${input.action}`,
      messages: input.messages,
    });
  }
  return false;
}
