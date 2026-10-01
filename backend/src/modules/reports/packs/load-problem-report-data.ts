import type { PrismaService } from '../../../common/prisma/prisma.service';
import { formatProblemNumber } from '../../problems/problem-rules';
import { problemDefaults } from '../../settings/definitions/problem-settings';
import { settingKeys } from '../../settings/setting-keys';
import type { ReportWindow } from '../reports.types';
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
  input: { readonly unitIds: readonly string[]; readonly part: ProblemReportPart; readonly window: ReportWindow; readonly now: Date },
): Promise<ProblemReportData> {
  const data: ProblemReportData = { ...emptyProblemReportData, now: input.now };
  if (input.unitIds.length === 0) return data;
  const inUnits = { organizationalUnitId: { in: [...input.unitIds] } };
  const inWindow = { gte: input.window.from, lt: input.window.to };

  if (input.part === 'top') {
    const counts = await prisma.problemTicket.groupBy({
      by: ['problemId'],
      where: { linkedAt: inWindow, problem: inUnits },
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
          _count: { select: { tickets: true } },
        },
      }),
      prisma.problemTicket.groupBy({
        by: ['problemId'],
        where: { problemId: { in: ids }, ticket: { status: { notIn: [...closedTicketStatuses] } } },
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
    });
    return { ...data, backlog: rows };
  }

  // recurrence: a ticket linked to a RESOLVED problem is flagged on the event (P5).
  const events = await prisma.problemEvent.findMany({
    where: { action: 'ticket_linked', createdAt: inWindow, detail: { path: ['recurrence'], equals: true }, problem: inUnits },
    select: { createdAt: true, problem: { select: { sequence: true, title: true, status: true, resolvedAt: true } } },
  });
  if (events.length === 0) return data;
  const prefix = await readNumberPrefix(prisma);
  return {
    ...data,
    recurrence: events.map((event) => ({
      number: formatProblemNumber(prefix, event.problem.sequence),
      title: event.problem.title,
      status: event.problem.status,
      resolvedAt: event.problem.resolvedAt,
      linkedAt: event.createdAt,
    })),
  };
}
