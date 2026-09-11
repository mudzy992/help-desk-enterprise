import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  automationFingerprint,
  claimGuardrailTrigger,
} from '../guardrails/claim-guardrail-trigger';
import { guardrailClaimKinds } from '../guardrails/guardrails.constants';
import type { TicketGuardrailsConfiguration } from '../guardrails/guardrails.types';
import type { TicketRecord } from '../tickets.types';

export async function claimTicketArchive(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly guardrails: TicketGuardrailsConfiguration;
  readonly now: Date;
}): Promise<boolean> {
  if (input.ticket.closedAt === null) {
    return false;
  }
  const decision = await claimGuardrailTrigger({
    prisma: input.prisma,
    configuration: input.guardrails,
    claim: {
      kind: guardrailClaimKinds.automation,
      subjectKey: input.ticket.id,
      fingerprint: automationFingerprint(
        'archive',
        input.ticket.closedAt.toISOString(),
      ),
      ticketId: input.ticket.id,
      now: input.now,
    },
  });
  return decision.allowed;
}
