import type { JsonValue } from '../change-log/change-log.types';
import type { CloseCodeDescriptor, TicketCloseCodesConfiguration } from './close-codes/close-codes.types';
import { listConfiguredCloseCodes } from './close-codes/resolve-close-code-record';
import type { RedactionMatch } from './redaction/redaction.types';
import type { DuplicateTicketMatch } from './guardrails/guardrails.types';
import { describeTicketReopen } from './reopen/resolve-ticket-reopen-policy';
import type { TicketReopenConfiguration } from './reopen/reopen.types';
import type { TicketRecord, TicketResponse } from './tickets.types';

export function toTicketResponse(record: TicketRecord): TicketResponse {
  return {
    id: record.id,
    ticketNumber: record.ticketNumber,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    impact: record.impact,
    urgency: record.urgency,
    classification: record.classification,
    isConfidential: record.isConfidential,
    formData: toJsonValue(record.formData),
    originUnitId: record.originUnitId,
    serviceId: record.serviceId,
    formVersionRef: record.formVersionId,
    requesterId: record.requesterId,
    assignedGroupId: record.assignedGroupId,
    assignedUserId: record.assignedUserId,
    parentTicketId: record.parentTicketId,
    mergedIntoTicketId: record.mergedIntoTicketId,
    reopenedFromTicketId: record.reopenedFromTicketId,
    resolvedAt: toIso(record.resolvedAt),
    closedAt: toIso(record.closedAt),
    archivedAt: toIso(record.archivedAt),
    waitingForUserEnteredAt: toIso(record.waitingForUserEnteredAt),
    forwardCount: record.forwardCount ?? 0,
    lastForwardedAt: toIso(record.lastForwardedAt ?? null),
    lastForwardFromGroupName: record.lastForwardFromGroupName ?? null,
    isOverdue: false,
    isAtRisk: false,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toTicketClientResponse(
  record: TicketRecord,
  input: {
    readonly reopen: TicketReopenConfiguration;
    readonly closeCodes: TicketCloseCodesConfiguration;
    readonly closeCode: CloseCodeDescriptor | null;
    readonly redactionWarnings?: readonly RedactionMatch[];
    readonly duplicateWarnings?: readonly DuplicateTicketMatch[];
    readonly now?: Date;
  },
): TicketResponse {
  return {
    ...toTicketResponse(record),
    reopen: describeTicketReopen(record, input.reopen, input.now ?? new Date()),
    closePolicy: {
      enabled: input.closeCodes.enabled,
      requireOnResolve: input.closeCodes.requireOnResolve,
      allowedCodes: listConfiguredCloseCodes(input.closeCodes),
      closeCode: input.closeCode,
      resolutionNote: record.resolutionNote,
    },
    redactionWarnings: input.redactionWarnings,
    duplicateWarnings: input.duplicateWarnings,
  };
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
