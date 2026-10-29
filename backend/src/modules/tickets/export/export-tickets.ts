import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { recordAuditEntry } from "../../audit-log/record-audit-entry";
import {
  auditLogActions,
  auditLogEntityTypes,
} from "../../audit-log/audit-log.constants";
import { AuthorizationContextLoader } from "../../authorization/authorization-context.loader";
import { listTicketsForExport } from "../list-tickets";
import type { AuthorizationContext } from "../../authorization/authorization.types";
import { buildTicketSurfaceVisibility } from "../list/build-ticket-surface-visibility";
import { loadTicketOverdueFlags } from "../load-ticket-overdue-flags";
import { TicketsError } from "../tickets.error";
import type { TicketAccessPolicyContext } from "../with-ticket-access-policies";
import { assertCanExportTickets } from "./assert-can-export-tickets";
import { buildTicketExportRows } from "./build-ticket-export-rows";
import {
  ticketExportContentType,
  ticketExportMaxRows,
} from "./export.constants";
import type { ExportTicketsQuery, TicketsExportResult } from "./export.types";
import { loadTicketExportLabels } from "./load-ticket-export-labels";
import { serializeTicketsCsv } from "./serialize-tickets-csv";

export async function exportTicketsCsv(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly query: ExportTicketsQuery;
  readonly context: TicketAccessPolicyContext;
  readonly requestId: string | null;
  readonly now?: Date;
}): Promise<TicketsExportResult> {
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError("FORBIDDEN");
  }
  assertCanExportTickets(authContext);

  // Export-only confidentiality and audit.export assignment scope are part of
  // the SQL predicate before cursor batching and the row ceiling. An excluded
  // row can therefore never displace a later eligible row.
  const loaded = await listTicketsForExport(
    input.prisma,
    input.authorizationContextLoader,
    { ...input.query, searchDescription: true },
    input.context,
    input.context.archive,
    ticketExportMaxRows + 1,
    buildTicketExportWhere(authContext),
  );
  const truncated = loaded.length > ticketExportMaxRows;
  const tickets = loaded.slice(0, ticketExportMaxRows);
  const units = await input.prisma.organizationalUnit.findMany({
    select: { id: true, name: true, ouPath: true },
  });
  const unitLabelById = new Map(
    units.map((unit) => [
      unit.id,
      unit.ouPath.length > 0 ? unit.ouPath : unit.name,
    ]),
  );
  const overdueByTicketId = await loadTicketOverdueFlags(
    input.prisma,
    tickets.map((ticket) => ticket.id),
  );
  const labels = await loadTicketExportLabels(input.prisma, tickets);
  const content = serializeTicketsCsv(
    buildTicketExportRows({
      tickets,
      labels,
      unitLabelById,
      overdueByTicketId,
    }),
  );
  await recordAuditEntry(input.prisma, {
    action: auditLogActions.ticketsExport,
    entityType: auditLogEntityTypes.ticketExport,
    entityId: "tickets",
    metadata: {
      format: "csv",
      recordCount: tickets.length,
      eligibleCountLowerBound: loaded.length,
      eligibleCountIsLowerBound: truncated,
      truncated,
      maxRows: ticketExportMaxRows,
      filters: describeAppliedFilters(input.query),
    },
    actorUserId: input.context.actorUserId,
    requestId: input.requestId,
    organizationalUnitId: input.query.originUnitId ?? null,
  });
  return {
    fileName: `tickets-${formatFileTimestamp(input.now ?? new Date())}.csv`,
    contentType: ticketExportContentType,
    content,
    recordCount: tickets.length,
    manifest: {
      exportedCount: tickets.length,
      eligibleCountLowerBound: loaded.length,
      eligibleCountIsLowerBound: truncated,
      truncated,
      maxRows: ticketExportMaxRows,
    },
  };
}

export function buildTicketExportWhere(
  context: AuthorizationContext,
): Prisma.TicketWhereInput {
  return buildTicketSurfaceVisibility({ surface: "audit_export", context })!;
}

// Free-text search terms are deliberately not written to the audit chain.
function describeAppliedFilters(
  query: ExportTicketsQuery,
): Record<string, string | boolean> {
  const candidates: ReadonlyArray<
    readonly [string, string | boolean | undefined]
  > = [
    ["originUnitId", query.originUnitId],
    ["serviceId", query.serviceId],
    ["status", query.status],
    ["priority", query.priority],
    ["assignedUserId", query.assignedUserId],
    ["requesterId", query.requesterId],
    ["unassigned", query.unassigned === true ? true : undefined],
    ["overdue", query.overdue === true ? true : undefined],
    ["createdFrom", query.createdFrom],
    ["createdTo", query.createdTo],
    [
      "hasSearch",
      query.q !== undefined && query.q.trim().length > 0 ? true : undefined,
    ],
  ];
  return Object.fromEntries(
    candidates.filter(
      (entry): entry is readonly [string, string | boolean] =>
        entry[1] !== undefined,
    ),
  );
}

function formatFileTimestamp(value: Date): string {
  return value
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .slice(0, 13)
    .replace("T", "-");
}
