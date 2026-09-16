import { PrismaService } from '../../../common/prisma/prisma.service';
import type { CreateTicketInput } from '../tickets.types';
import { assertDuplicateTicketAllowed } from './assert-duplicate-ticket-allowed';
import { findDuplicateTickets } from './find-duplicate-tickets';
import { disabledTicketGuardrailsConfiguration } from './guardrails.constants';
import type {
  DuplicateTicketMatch,
  TicketGuardrailsConfiguration,
} from './guardrails.types';

export function duplicateGuardrailSubjectKey(
  requesterId: string,
  serviceId: string,
): string {
  return `duplicate:${requesterId}:${serviceId}`;
}

export async function applyCreateTicketGuardrails(input: {
  readonly prisma: PrismaService;
  readonly createInput: CreateTicketInput;
  readonly requesterId: string;
  readonly serviceId: string;
  readonly description: string;
  readonly configuration?: TicketGuardrailsConfiguration;
  readonly sink: DuplicateTicketMatch[];
  readonly now?: Date;
}): Promise<void> {
  const configuration =
    input.configuration ?? disabledTicketGuardrailsConfiguration;
  if (
    !configuration.enabled ||
    input.createInput.parentTicketId !== undefined ||
    input.createInput.reopenedFromTicketId !== undefined
  ) {
    return;
  }
  const matches = await findDuplicateTickets({
    prisma: input.prisma,
    configuration,
    requesterId: input.requesterId,
    serviceId: input.serviceId,
    description: input.description,
    now: input.now,
  });
  assertDuplicateTicketAllowed({
    configuration,
    matches,
    acknowledgeDuplicate: input.createInput.acknowledgeDuplicate,
  });
  input.sink.push(...matches);
}
