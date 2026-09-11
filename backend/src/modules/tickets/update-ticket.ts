import { applyTicketLifecycleTimestamps } from './apply-ticket-lifecycle-timestamps';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { changeLogActions } from '../change-log/change-log.constants';
import { assertPatchTicketStatus } from './assert-patch-ticket-status';
import { assertTicketVisible } from './authorize-ticket-actor';
import { calculateTicketPriority } from './calculate-ticket-priority';
import { applyTicketResolution } from './close-codes/apply-ticket-resolution';
import type { TicketCloseCodesConfiguration } from './close-codes/close-codes.types';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { assertTicketWritable } from './archive/assert-ticket-writable';
import { getTicket } from './get-ticket';
import { ticketSystemEventActions } from './collaboration.constants';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import {
  normalizeTicketDescription,
  normalizeTicketTitle,
} from './normalize-ticket-text';
import {
  assertRedactionAllowed,
  scanTicketContent,
} from './redaction/assert-ticket-content-redaction';
import { recordRedactionWarning } from './redaction/record-redaction-warning';
import type { TicketRedactionConfiguration } from './redaction/redaction.types';
import { recordTicketChange } from './record-ticket-change';
import type { TicketRequiredFieldsConfiguration } from './required-fields/required-fields.types';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketFormDataInput } from './to-ticket-form-data-input';
import type {
  TicketMutationContext,
  TicketRecord,
  UpdateTicketInput,
} from './tickets.types';

export type TicketUpdatePolicies = {
  readonly closeCodes: TicketCloseCodesConfiguration;
  readonly requiredFields: TicketRequiredFieldsConfiguration;
  readonly redaction: TicketRedactionConfiguration;
};

export async function updateTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  input: UpdateTicketInput,
  context: TicketMutationContext,
  messages: TicketPersistedMessageSink = [],
  policies?: TicketUpdatePolicies,
): Promise<TicketRecord> {
  const current = await getTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    current.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  assertTicketVisible({
    context: authContext,
    requesterId: current.requesterId,
    originUnitId: current.originUnitId,
    originUnitPath,
    serviceId: current.serviceId,
  });
  const nextStatus = input.status ?? current.status;
  assertTicketWritable(current, context);
  if (input.status !== undefined) {
    assertPatchTicketStatus({
      context: authContext,
      from: current.status,
      to: input.status,
    });
  }
  const title =
    input.title === undefined ? current.title : normalizeTicketTitle(input.title);
  const description =
    input.description === undefined
      ? current.description
      : normalizeTicketDescription(input.description);
  const formData =
    input.formData === undefined ? current.formData : input.formData;
  const scan = scanTicketContent({
    configuration: policies?.redaction ?? { enabled: false, mode: 'warn_only', applyToFields: [], patterns: [] },
    title: input.title === undefined ? undefined : title,
    description: input.description === undefined ? undefined : description,
  });
  assertRedactionAllowed(scan);
  const resolution =
    policies === undefined
      ? {
          closeCodeId: current.closeCodeId,
          resolutionNote: current.resolutionNote,
        }
      : await applyTicketResolution({
          prisma,
          current,
          nextStatus,
          closeCode: input.closeCode,
          resolutionNote: input.resolutionNote,
          formData,
          closeCodes: policies.closeCodes,
          requiredFields: policies.requiredFields,
        });
  const impact = input.impact ?? current.impact;
  const urgency = input.urgency ?? current.urgency;
  const now = new Date();
  const timestamps = applyTicketLifecycleTimestamps({
    current,
    nextStatus,
    now,
  });
  const updated = await prisma.$transaction(async (transaction) => {
    const record = (await transaction.ticket.update({
      where: { id: ticketId },
      data: {
        title,
        description,
        impact,
        urgency,
        priority: calculateTicketPriority(impact, urgency),
        status: nextStatus,
        formData: toTicketFormDataInput(formData),
        closeCodeId: resolution.closeCodeId,
        resolutionNote: resolution.resolutionNote,
        ...timestamps,
      },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.update,
      reason: ticketChangeLogReasons.update,
      before: current,
      after: record,
      actorUserId: context.actorUserId,
      redaction: policies?.redaction,
      safeLogging: context.safeLogging,
    });
    if (
      current.status !== 'WAITING_FOR_USER' &&
      record.status === 'WAITING_FOR_USER'
    ) {
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId: record.id,
          action: ticketSystemEventActions.waitingForUserEntered,
          actorUserId: context.actorUserId,
        }),
      );
    }
    await recordRedactionWarning({
      prisma: transaction as PrismaService,
      ticketId: record.id,
      actorUserId: context.actorUserId,
      scan,
      messages,
    });
    return record;
  });
  return updated;
}
