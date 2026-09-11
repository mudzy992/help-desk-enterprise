import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import {
  automationFingerprint,
  claimGuardrailTrigger,
} from '../guardrails/claim-guardrail-trigger';
import { guardrailClaimKinds } from '../guardrails/guardrails.constants';
import type { TicketGuardrailsConfiguration } from '../guardrails/guardrails.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { assertTicketWritable } from '../archive/assert-ticket-writable';
import {
  assertRedactionAllowed,
  scanTicketContent,
} from '../redaction/assert-ticket-content-redaction';
import type { TicketRedactionConfiguration } from '../redaction/redaction.types';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { canActorSubmitTicketCsat } from './can-submit-ticket-csat';
import { csatConstants, csatGuardrailFingerprint } from './csat.constants';
import type {
  SubmitTicketCsatInput,
  TicketCsatConfiguration,
  TicketCsatRecord,
} from './csat.types';

export async function submitTicketCsat(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly ticketId: string;
  readonly body: SubmitTicketCsatInput;
  readonly context: TicketMutationContext;
  readonly configuration: TicketCsatConfiguration;
  readonly guardrails: TicketGuardrailsConfiguration;
  readonly redaction: TicketRedactionConfiguration;
  readonly messages: TicketPersistedMessageSink;
}): Promise<{ ticket: TicketRecord; submission: TicketCsatRecord }> {
  const { ticket } = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  assertTicketWritable(ticket, input.context);
  if (!input.configuration.enabled) {
    throw new TicketsError('CSAT_DISABLED');
  }
  const existing = (await input.prisma.ticketCsat.findUnique({
    where: { ticketId: ticket.id },
  })) as TicketCsatRecord | null;
  if (
    !canActorSubmitTicketCsat({
      configuration: input.configuration,
      ticketId: ticket.id,
      status: ticket.status,
      requesterId: ticket.requesterId,
      actorUserId: input.context.actorUserId,
      alreadySubmitted: existing !== null,
    })
  ) {
    throw new TicketsError(existing === null ? 'CSAT_NOT_ELIGIBLE' : 'CSAT_ALREADY_SUBMITTED');
  }
  const rating = normalizeRating(input.body.rating, input.configuration.scaleMax);
  const comment = normalizeComment(input.body.comment);
  const scan = scanTicketContent({
    configuration: input.redaction,
    message: comment ?? undefined,
  });
  assertRedactionAllowed(scan);
  const claimed = await claimGuardrailTrigger({
    prisma: input.prisma,
    configuration: input.guardrails,
    claim: {
      kind: guardrailClaimKinds.event,
      subjectKey: ticket.id,
      fingerprint: automationFingerprint(csatGuardrailFingerprint, ticket.id),
      ticketId: ticket.id,
      actorUserId: input.context.actorUserId,
    },
  });
  if (!claimed.allowed) {
    throw new TicketsError('CSAT_ALREADY_SUBMITTED');
  }
  try {
    const submission = (await input.prisma.ticketCsat.create({
      data: {
        ticketId: ticket.id,
        rating,
        comment,
        submittedByUserId: input.context.actorUserId,
      },
    })) as TicketCsatRecord;
    await recordTicketChange(input.prisma, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.csatSubmit,
      before: ticket,
      after: ticket,
      actorUserId: input.context.actorUserId,
    });
    input.messages.push(
      await insertSystemTicketEvent(input.prisma, {
        ticketId: ticket.id,
        action: `${ticketSystemEventActions.csatSubmitted}:${rating}`,
        actorUserId: input.context.actorUserId,
      }),
    );
    return { ticket, submission };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new TicketsError('CSAT_ALREADY_SUBMITTED');
    }
    throw error;
  }
}

function normalizeRating(rating: number, scaleMax: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > scaleMax) {
    throw new TicketsError('INVALID_CSAT_RATING');
  }
  return rating;
}

function normalizeComment(comment: string | undefined): string | null {
  if (comment === undefined) {
    return null;
  }
  const trimmed = comment.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > csatConstants.maximumCommentLength) {
    throw new TicketsError('INVALID_CSAT_COMMENT');
  }
  return trimmed;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  );
}
