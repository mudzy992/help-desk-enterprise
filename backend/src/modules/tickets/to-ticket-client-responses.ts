import { PrismaService } from '../../common/prisma/prisma.service';
import { loadCloseCodesByIds } from './close-codes/resolve-close-code-record';
import type { TicketCloseCodesConfiguration } from './close-codes/close-codes.types';
import type { RedactionMatch } from './redaction/redaction.types';
import type { DuplicateTicketMatch } from './guardrails/guardrails.types';
import type { TicketReopenConfiguration } from './reopen/reopen.types';
import type { TicketCsatConfiguration } from './csat/csat.types';
import { describeTicketCsat } from './csat/describe-ticket-csat';
import { loadTicketCsatSubmissions } from './csat/load-ticket-csat-submissions';
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
    readonly now?: Date;
  },
): Promise<readonly TicketResponse[]> {
  const closeCodes = await loadCloseCodesByIds(
    prisma,
    records.map((record) => record.closeCodeId ?? ''),
  );
  const submissions =
    input.csat === undefined
      ? new Map()
      : await loadTicketCsatSubmissions(
          prisma,
          records.map((record) => record.id),
        );
  return records.map((record) => {
    const response = toTicketClientResponse(record, {
      reopen: input.reopen,
      closeCodes: input.closeCodes,
      closeCode:
        record.closeCodeId === null
          ? null
          : (closeCodes.get(record.closeCodeId) ?? null),
      redactionWarnings: input.redactionWarnings,
      duplicateWarnings: input.duplicateWarnings,
      now: input.now,
    });
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
  },
  redactionWarnings?: readonly RedactionMatch[],
  duplicateWarnings?: readonly DuplicateTicketMatch[],
): Promise<TicketResponse> {
  return toSingleTicketClientResponse(prisma, record, {
    reopen: await loaders.reopen.load(),
    closeCodes: await loaders.closeCodes.load(),
    csat: loaders.csat === undefined ? undefined : await loaders.csat.load(),
    actorUserId: loaders.actorUserId,
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
  },
): Promise<readonly TicketResponse[]> {
  return toTicketClientResponses(prisma, records, {
    reopen: await loaders.reopen.load(),
    closeCodes: await loaders.closeCodes.load(),
    csat: loaders.csat === undefined ? undefined : await loaders.csat.load(),
    actorUserId: loaders.actorUserId,
  });
}
