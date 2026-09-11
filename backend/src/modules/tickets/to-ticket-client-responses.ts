import { PrismaService } from '../../common/prisma/prisma.service';
import { loadCloseCodesByIds } from './close-codes/resolve-close-code-record';
import type { TicketCloseCodesConfiguration } from './close-codes/close-codes.types';
import type { RedactionMatch } from './redaction/redaction.types';
import type { TicketReopenConfiguration } from './reopen/reopen.types';
import { toTicketClientResponse } from './to-ticket-response';
import type { TicketRecord, TicketResponse } from './tickets.types';

export async function toTicketClientResponses(
  prisma: PrismaService,
  records: readonly TicketRecord[],
  input: {
    readonly reopen: TicketReopenConfiguration;
    readonly closeCodes: TicketCloseCodesConfiguration;
    readonly redactionWarnings?: readonly RedactionMatch[];
    readonly now?: Date;
  },
): Promise<readonly TicketResponse[]> {
  const closeCodes = await loadCloseCodesByIds(
    prisma,
    records.map((record) => record.closeCodeId ?? ''),
  );
  return records.map((record) =>
    toTicketClientResponse(record, {
      reopen: input.reopen,
      closeCodes: input.closeCodes,
      closeCode:
        record.closeCodeId === null
          ? null
          : (closeCodes.get(record.closeCodeId) ?? null),
      redactionWarnings: input.redactionWarnings,
      now: input.now,
    }),
  );
}

export async function toSingleTicketClientResponse(
  prisma: PrismaService,
  record: TicketRecord,
  input: {
    readonly reopen: TicketReopenConfiguration;
    readonly closeCodes: TicketCloseCodesConfiguration;
    readonly redactionWarnings?: readonly RedactionMatch[];
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
  },
  redactionWarnings?: readonly RedactionMatch[],
): Promise<TicketResponse> {
  return toSingleTicketClientResponse(prisma, record, {
    reopen: await loaders.reopen.load(),
    closeCodes: await loaders.closeCodes.load(),
    redactionWarnings,
  });
}

export async function respondLoadedTickets(
  prisma: PrismaService,
  records: readonly TicketRecord[],
  loaders: {
    readonly reopen: { load: () => Promise<TicketReopenConfiguration> };
    readonly closeCodes: { load: () => Promise<TicketCloseCodesConfiguration> };
  },
): Promise<readonly TicketResponse[]> {
  return toTicketClientResponses(prisma, records, {
    reopen: await loaders.reopen.load(),
    closeCodes: await loaders.closeCodes.load(),
  });
}
