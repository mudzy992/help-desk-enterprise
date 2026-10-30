import { PrismaService } from '../../common/prisma/prisma.service';
import { loadCloseCodesByIds } from './close-codes/resolve-close-code-record';
import type { TicketCloseCodesConfiguration } from './close-codes/close-codes.types';
import type { RedactionMatch } from './redaction/redaction.types';
import type { DuplicateTicketMatch } from './guardrails/guardrails.types';
import type { TicketReopenConfiguration } from './reopen/reopen.types';
import type { TicketCsatConfiguration } from './csat/csat.types';
import { describeTicketCsat } from './csat/describe-ticket-csat';
import { isTicketSlaAtRisk } from '../sla/is-ticket-sla-at-risk';
import { isTicketSlaOverdue } from '../sla/is-ticket-sla-overdue';
import { loadParentTicketSummaries } from './load-parent-ticket-summaries';
import { loadTicketDisplayLabels } from './load-ticket-display-labels';
import type { TicketLabelCache } from './labels/ticket-label-cache';
import { loadTicketSlaAndCsat } from './load-ticket-sla-and-csat';
import {
  hasTicketResponseRelations,
} from './ticket-response-relations';
import { mapTicketResponseJoinedData } from './ticket-response-joined-data';
import { toTicketLabelFields } from './ticket-label-fields';
import { toTicketClientResponse } from './to-ticket-response';
import type { TicketRecord, TicketResponse } from './tickets.types';

export async function toTicketClientResponses(
  prisma: PrismaService,
  records: readonly TicketRecord[],
  input: {
    readonly reopen: TicketReopenConfiguration;
    readonly closeCodes: TicketCloseCodesConfiguration;
    readonly redactionWarnings?: readonly RedactionMatch[];
    readonly duplicateWarnings?: readonly DuplicateTicketMatch[];
    readonly csat?: TicketCsatConfiguration;
    readonly actorUserId?: string;
    readonly labelCache?: TicketLabelCache;
    readonly now?: Date;
  },
): Promise<readonly TicketResponse[]> {
  const ticketIds = records.map((record) => record.id);
  const joinedData = hasTicketResponseRelations(records)
    ? mapTicketResponseJoinedData(records, input.csat !== undefined)
    : null;
  const closeCodes =
    joinedData?.closeCodes ??
    (await loadCloseCodesByIds(
      prisma,
      records.map((record) => record.closeCodeId ?? ''),
    ));
  // Joined reads already carry SLA/CSAT and labels; mutation responses and
  // hand-built test delegates retain the existing batched-loader fallback.
  const { sla: slaByTicketId, csat: submissions } =
    joinedData ??
    (await loadTicketSlaAndCsat(
      prisma,
      ticketIds,
      input.csat !== undefined,
    ));
  const parentsById =
    joinedData?.parents ?? (await loadParentTicketSummaries(prisma, records));
  const labels =
    joinedData?.labels ??
    (await loadTicketDisplayLabels(prisma, records, input.labelCache));
  return records.map((record) => {
    const parent =
      record.parentTicketId === null
        ? undefined
        : parentsById.get(record.parentTicketId);
    const response: TicketResponse = {
      ...toTicketClientResponse(record, {
        reopen: input.reopen,
        closeCodes: input.closeCodes,
        closeCode:
          record.closeCodeId === null
            ? null
            : (closeCodes.get(record.closeCodeId) ?? null),
        redactionWarnings: input.redactionWarnings,
        duplicateWarnings: input.duplicateWarnings,
        now: input.now,
      }),
      ...toTicketLabelFields(record, labels),
      parentTicketNumber: parent?.ticketNumber ?? null,
      parentTicketTitle: parent?.title ?? null,
      mergedIntoTicketNumber:
        record.mergedIntoTicketId === null
          ? null
          : (parentsById.get(record.mergedIntoTicketId)?.ticketNumber ?? null),
      isOverdue: isTicketSlaOverdue(slaByTicketId.get(record.id)),
      isAtRisk: isTicketSlaAtRisk(slaByTicketId.get(record.id)),
      sla: slaByTicketId.get(record.id) ?? null,
    };
    if (input.csat === undefined || input.actorUserId === undefined) {
      return response;
    }
    return {
      ...response,
      csat: describeTicketCsat({
        ticket: record,
        configuration: input.csat,
        submission: submissions.get(record.id) ?? null,
        actorUserId: input.actorUserId,
      }),
    };
  });
}

export async function toSingleTicketClientResponse(
  prisma: PrismaService,
  record: TicketRecord,
  input: {
    readonly reopen: TicketReopenConfiguration;
    readonly closeCodes: TicketCloseCodesConfiguration;
    readonly redactionWarnings?: readonly RedactionMatch[];
    readonly duplicateWarnings?: readonly DuplicateTicketMatch[];
    readonly csat?: TicketCsatConfiguration;
    readonly actorUserId?: string;
    readonly labelCache?: TicketLabelCache;
    readonly now?: Date;
  },
): Promise<TicketResponse> {
  const [response] = await toTicketClientResponses(prisma, [record], input);
  return response;
}

export async function respondLoadedTicket(
  prisma: PrismaService,
  record: TicketRecord,
  loaders: {
    readonly reopen: { load: () => Promise<TicketReopenConfiguration> };
    readonly closeCodes: { load: () => Promise<TicketCloseCodesConfiguration> };
    readonly csat?: { load: () => Promise<TicketCsatConfiguration> };
    readonly actorUserId?: string;
    readonly labelCache?: TicketLabelCache;
  },
  redactionWarnings?: readonly RedactionMatch[],
  duplicateWarnings?: readonly DuplicateTicketMatch[],
): Promise<TicketResponse> {
  return toSingleTicketClientResponse(prisma, record, {
    reopen: await loaders.reopen.load(),
    closeCodes: await loaders.closeCodes.load(),
    csat: loaders.csat === undefined ? undefined : await loaders.csat.load(),
    actorUserId: loaders.actorUserId,
    labelCache: loaders.labelCache,
    redactionWarnings,
    duplicateWarnings,
  });
}

export async function respondLoadedTickets(
  prisma: PrismaService,
  records: readonly TicketRecord[],
  loaders: {
    readonly reopen: { load: () => Promise<TicketReopenConfiguration> };
    readonly closeCodes: { load: () => Promise<TicketCloseCodesConfiguration> };
    readonly csat?: { load: () => Promise<TicketCsatConfiguration> };
    readonly actorUserId?: string;
    readonly labelCache?: TicketLabelCache;
  },
): Promise<readonly TicketResponse[]> {
  return toTicketClientResponses(prisma, records, {
    reopen: await loaders.reopen.load(),
    closeCodes: await loaders.closeCodes.load(),
    csat: loaders.csat === undefined ? undefined : await loaders.csat.load(),
    actorUserId: loaders.actorUserId,
    labelCache: loaders.labelCache,
  });
}
