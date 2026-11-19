import type { PrismaService } from '../../../common/prisma/prisma.service';
import { formatProblemNumber } from '../../problems/problem-rules';
import { problemDefaults } from '../../settings/definitions/problem-settings';
import { settingKeys } from '../../settings/setting-keys';
import type { ReportPackFilters, ReportWindow } from '../reports.types';
import type { ProblemReportVisibility } from '../problem-report-visibility';
import { emptyProblemReportData, type ProblemReportData } from './build-problem-reports';

export type ProblemReportPart = 'top' | 'knownError' | 'resolution' | 'backlog' | 'recurrence';

const openProblemStatuses = ['NEW', 'INVESTIGATING', 'KNOWN_ERROR'] as const;
const closedTicketStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

async function readNumberPrefix(prisma: PrismaService): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKeys.privateProblemsNumberPrefix }, select: { value: true } });
  return typeof row?.value === 'string' ? row.value : problemDefaults.numberPrefix;
}

/** Loads only the part the requested pack needs; problems are scoped by their unit. */
export async function loadProblemReportData(
  prisma: PrismaService,
  input: {
    readonly unitIds: readonly string[];
    readonly part: ProblemReportPart;
    readonly window: ReportWindow;
    readonly now: Date;
    readonly visibility: ProblemReportVisibility;
    /** W7.53: row budget (+1 probe row) for this pack request. */
    readonly rowLimit?: number;
    /**
     * W7.54 (BA-reports-02): the schedule slice, applied to the problem record
     * (its own service, group and priority) — never to the linked tickets.
     */
    readonly filters?: ReportPackFilters;
  },
): Promise<ProblemReportData> {
  const data: ProblemReportData = { ...emptyProblemReportData, now: input.now };
  if (input.unitIds.length === 0) return data;
  const inUnits = {
    AND: [
      { organizationalUnitId: { in: [...input.unitIds] } },
      input.visibility.problem,
      ...(input.filters?.serviceId === undefined
        ? []
        : [{ serviceId: input.filters.serviceId }]),
      ...(input.filters?.groupId === undefined
        ? []
        : [{ groupId: input.filters.groupId }]),
      ...(input.filters?.priority === undefined
        ? []
        : [{ priority: input.filters.priority }]),
    ],
  };
  const readableTicket = input.visibility.ticket;
  const inWindow = { gte: input.window.from, lt: input.window.to };
  // A probe row (`rowLimit + 1`) tells the caller the part overflowed its budget.
  const take = input.rowLimit === undefined ? undefined : input.rowLimit + 1;

  if (input.part === 'top') {
    const counts = await prisma.problemTicket.groupBy({
      by: ['problemId'],
      where: { linkedAt: inWindow, problem: inUnits, ticket: { is: readableTicket } },
      _count: { _all: true },
    });
    if (counts.length === 0) return data;
    const ids = counts.map((row) => row.problemId);
    const [prefix, problems, open] = await Promise.all([
      readNumberPrefix(prisma),
      prisma.problem.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          sequence: true,
          title: true,
          status: true,
          priority: true,
          rootCauseCategory: true,
          service: { select: { name: true } },
          group: { select: { name: true } },
          _count: { select: { tickets: { where: { ticket: { is: readableTicket } } } } },
        },
        take,
      }),
      prisma.problemTicket.groupBy({
        by: ['problemId'],
        where: { problemId: { in: ids }, ticket: { is: { AND: [readableTicket, { status: { notIn: [...closedTicketStatuses] } }] } } },
        _count: { _all: true },
      }),
    ]);
    const inPeriod = new Map(counts.map((row) => [row.problemId, row._count._all]));
    const openById = new Map(open.map((row) => [row.problemId, row._count._all]));
    return {
      ...data,
      top: problems.map((problem) => ({
        number: formatProblemNumber(prefix, problem.sequence),
        title: problem.title,
        status: problem.status,
        priority: problem.priority,
        serviceName: problem.service?.name ?? null,
        rootCauseCategory: problem.rootCauseCategory,
        groupName: problem.group?.name ?? null,
        ticketsInPeriod: inPeriod.get(problem.id) ?? 0,
        ticketsTotal: problem._count.tickets,
        openTickets: openById.get(problem.id) ?? 0,
      })),
    };
  }

  if (input.part === 'knownError' || input.part === 'resolution') {
    const field = input.part === 'knownError' ? 'identifiedAt' : 'resolvedAt';
    const rows = await prisma.problem.findMany({
      where: { ...inUnits, [field]: inWindow },
      select: { priority: true, createdAt: true, identifiedAt: true, resolvedAt: true, group: { select: { name: true } } },
      take,
    });
    const records = rows.flatMap((row) => {
      const reachedAt = input.part === 'knownError' ? row.identifiedAt : row.resolvedAt;
      return reachedAt === null ? [] : [{ priority: row.priority, groupName: row.group?.name ?? null, createdAt: row.createdAt, reachedAt }];
    });
    return input.part === 'knownError' ? { ...data, knownError: records } : { ...data, resolution: records };
  }

  if (input.part === 'backlog') {
    const rows = await prisma.problem.findMany({
      where: { ...inUnits, status: { in: [...openProblemStatuses] } },
      select: { status: true, createdAt: true, targetAt: true },
      take,
    });
    return { ...data, backlog: rows };
  }

  // recurrence: a ticket linked to a RESOLVED problem is flagged on the event (P5).
  const events = await prisma.problemEvent.findMany({
    where: { action: 'ticket_linked', createdAt: inWindow, detail: { path: ['recurrence'], equals: true }, problem: inUnits },
    select: { createdAt: true, detail: true, problem: { select: { sequence: true, title: true, status: true, resolvedAt: true } } },
    take,
  });
  const ticketId = (detail: unknown): string | null => {
    if (detail === null || Array.isArray(detail) || typeof detail !== 'object') return null;
    const value = (detail as { ticketId?: unknown }).ticketId;
    return typeof value === 'string' ? value : null;
  };
  const ids = [...new Set(events.map((event) => ticketId(event.detail)).filter((id): id is string => id !== null))];
  if (ids.length === 0) return data;
  const readable = await prisma.ticket.findMany({ where: { AND: [readableTicket, { id: { in: ids } }] }, select: { id: true } });
  const allowed = new Set(readable.map((ticket) => ticket.id));
  const visibleEvents = events.filter((event) => { const id = ticketId(event.detail); return id !== null && allowed.has(id); });
  if (visibleEvents.length === 0) return data;
  const prefix = await readNumberPrefix(prisma);
  return {
    ...data,
    recurrence: visibleEvents.map((event) => ({
      number: formatProblemNumber(prefix, event.problem.sequence),
      title: event.problem.title,
      status: event.problem.status,
      resolvedAt: event.problem.resolvedAt,
      linkedAt: event.createdAt,
    })),
  };
}
