import { PrismaService } from '../../../common/prisma/prisma.service';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import {
  auditLogActions,
  auditLogEntityTypes,
} from '../../audit-log/audit-log.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { listTicketsWithin } from '../list-tickets';
import { loadTicketOverdueFlags } from '../load-ticket-overdue-flags';
import { TicketsError } from '../tickets.error';
import type { TicketAccessPolicyContext } from '../with-ticket-access-policies';
import {
  assertCanExportTickets,
  canExportTicketInScope,
} from './assert-can-export-tickets';
import { buildTicketExportRows } from './build-ticket-export-rows';
import { ticketExportContentType, ticketExportMaxRows } from './export.constants';
import type { ExportTicketsQuery, TicketsExportResult } from './export.types';
import { loadTicketExportLabels } from './load-ticket-export-labels';
import { serializeTicketsCsv } from './serialize-tickets-csv';

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
    throw new TicketsError('FORBIDDEN');
  }
  assertCanExportTickets(authContext);

  // The same visibility rules and filters as GET /tickets (OU/service scope,
  // confidential visibility, archive policy, search, SLA, dates) are applied in
  // the query itself; only the export-specific exclusions follow below.
  // Phase 1.1: bounded read. One row past the export ceiling is enough to know
  // the answer is `EXPORT_TOO_LARGE`, and it keeps the statement at `LIMIT n+1`
  // instead of loading the whole ticket table into memory.
  const visible = await listTicketsWithin(
    input.prisma,
    input.authorizationContextLoader,
    { ...input.query, searchDescription: true },
    input.context,
    input.context.archive,
    ticketExportMaxRows + 1,
  );
  const units = await input.prisma.organizationalUnit.findMany({
    select: { id: true, name: true, ouPath: true },
  });
  const pathById = new Map(units.map((unit) => [unit.id, unit.ouPath]));
  const unitLabelById = new Map(
    units.map((unit) => [unit.id, unit.ouPath.length > 0 ? unit.ouPath : unit.name]),
  );
  // Confidential tickets never leave the system through a bulk export.
  const tickets = visible.filter((ticket) => {
    if (ticket.isConfidential) {
      return false;
    }
    const originUnitPath = pathById.get(ticket.originUnitId);
    return (
      originUnitPath !== undefined &&
      canExportTicketInScope({
        context: authContext,
        originUnitId: ticket.originUnitId,
        originUnitPath,
        serviceId: ticket.serviceId,
      })
    );
  });
  const overdueByTicketId = await loadTicketOverdueFlags(
    input.prisma,
    tickets.map((ticket) => ticket.id),
  );
  if (tickets.length > ticketExportMaxRows) {
    throw new TicketsError(
      'EXPORT_TOO_LARGE',
      'EXPORT_TOO_LARGE',
      { maxRows: ticketExportMaxRows },
    );
  }
  const labels = await loadTicketExportLabels(input.prisma, tickets);
  const content = serializeTicketsCsv(
    buildTicketExportRows({ tickets, labels, unitLabelById, overdueByTicketId }),
  );
  await recordAuditEntry(input.prisma, {
    action: auditLogActions.ticketsExport,
    entityType: auditLogEntityTypes.ticketExport,
    entityId: 'tickets',
    metadata: {
      format: 'csv',
      recordCount: tickets.length,
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
  };
}

// Free-text search terms are deliberately not written to the audit chain.
function describeAppliedFilters(
  query: ExportTicketsQuery,
): Record<string, string | boolean> {
  const candidates: ReadonlyArray<readonly [string, string | boolean | undefined]> =
    [
      ['originUnitId', query.originUnitId],
      ['serviceId', query.serviceId],
      ['status', query.status],
      ['priority', query.priority],
      ['assignedUserId', query.assignedUserId],
      ['requesterId', query.requesterId],
      ['unassigned', query.unassigned === true ? true : undefined],
      ['overdue', query.overdue === true ? true : undefined],
      ['createdFrom', query.createdFrom],
      ['createdTo', query.createdTo],
      [
        'hasSearch',
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
  return value.toISOString().replaceAll(/[-:]/g, '').slice(0, 13).replace('T', '-');
}
