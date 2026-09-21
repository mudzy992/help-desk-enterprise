import type { TicketDisplayLabels } from './load-ticket-display-labels';
import type { TicketRecord, TicketResponse } from './tickets.types';

export type TicketLabelFields = Pick<
  TicketResponse,
  | 'requesterName'
  | 'assignedUserName'
  | 'assignedGroupName'
  | 'formVersionNumber'
  | 'originUnitName'
  | 'originUnitPath'
  | 'serviceName'
>;

/**
 * Maps the ids on a ticket to the display names the client shows, so the UI
 * never needs a second lookup (directory, catalog) to render a ticket.
 * Unknown ids resolve to `null`, never to the id itself.
 */
export function toTicketLabelFields(
  record: Pick<
    TicketRecord,
    | 'requesterId'
    | 'assignedUserId'
    | 'assignedGroupId'
    | 'formVersionId'
    | 'originUnitId'
    | 'serviceId'
  >,
  labels: TicketDisplayLabels,
): TicketLabelFields {
  const originUnit = labels.originUnits.get(record.originUnitId);
  return {
    requesterName: labels.users.get(record.requesterId) ?? null,
    assignedUserName:
      record.assignedUserId === null
        ? null
        : (labels.users.get(record.assignedUserId) ?? null),
    assignedGroupName:
      record.assignedGroupId === null
        ? null
        : (labels.groups.get(record.assignedGroupId) ?? null),
    formVersionNumber: labels.formVersions.get(record.formVersionId) ?? null,
    originUnitName: originUnit?.name ?? null,
    originUnitPath: originUnit?.path ?? null,
    serviceName: labels.services.get(record.serviceId) ?? null,
  };
}
