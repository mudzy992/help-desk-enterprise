import { defaultPingPongThreshold } from '../../settings/definitions/reports-settings';
import type { ReportExportRow, ReportPackBuildInput } from '../reports.types';

export const forwardPingPongColumns = [
  'ticketNumber',
  'title',
  'service',
  'currentGroup',
  'status',
  'forwardsInPeriod',
  'crossOuForwards',
  'distinctGroups',
  'groupPath',
  'firstForwardAt',
  'lastForwardAt',
] as const;

/** Stable placeholder; the UI translates it, files carry it verbatim. */
export const confidentialTitlePlaceholder = '[confidential]';

/** Package 1.6 (plan §3 D10): most-forwarded first, then ticket number. */
export function buildForwardPingPongReport(
  input: Pick<ReportPackBuildInput, 'forwardTickets' | 'pingPongThreshold'>,
): readonly ReportExportRow[] {
  const threshold = input.pingPongThreshold ?? defaultPingPongThreshold;
  return (input.forwardTickets ?? [])
    .filter((ticket) => ticket.events.length >= threshold)
    .map((ticket) => {
      const events = ticket.events;
      const path = [events[0]?.fromGroupName ?? '—', ...events.map((event) => event.toGroupName)];
      const groups = new Set<string>();
      for (const event of events) {
        if (event.fromGroupId !== null) groups.add(event.fromGroupId);
        groups.add(event.toGroupId);
      }
      return {
        ticketNumber: ticket.ticketNumber,
        title: ticket.isConfidential ? confidentialTitlePlaceholder : ticket.title,
        service: ticket.serviceName,
        currentGroup: ticket.currentGroupName,
        status: ticket.status,
        forwardsInPeriod: events.length,
        crossOuForwards: events.filter((event) => event.isCrossOu).length,
        distinctGroups: groups.size,
        groupPath: path.join(' → '),
        firstForwardAt: events[0]?.createdAt.toISOString() ?? null,
        lastForwardAt: events[events.length - 1]?.createdAt.toISOString() ?? null,
      };
    })
    .sort((left, right) => {
      const byCount = Number(right.forwardsInPeriod) - Number(left.forwardsInPeriod);
      return byCount !== 0
        ? byCount
        : String(left.ticketNumber).localeCompare(String(right.ticketNumber));
    });
}
