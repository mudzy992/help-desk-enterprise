import type { AuthorizationContext } from '../../authorization/authorization.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import type { TicketBulkConfiguration } from './bulk.types';

export function assertBulkTicketScope(input: {
  readonly context: AuthorizationContext;
  readonly configuration: TicketBulkConfiguration;
  readonly tickets: readonly TicketRecord[];
}): void {
  if (input.tickets.length === 0) {
    throw new TicketsError('NOT_FOUND');
  }
  if (input.context.isSuperAdmin && input.configuration.allowCrossOuForSuperAdmin) {
    return;
  }
  if (!input.configuration.requireSameOuAndGroup) {
    return;
  }
  const originUnitId = input.tickets[0].originUnitId;
  const assignedGroupId = input.tickets[0].assignedGroupId;
  const sameScope = input.tickets.every(
    (ticket) =>
      ticket.originUnitId === originUnitId &&
      ticket.assignedGroupId === assignedGroupId,
  );
  if (!sameScope) {
    throw new TicketsError('BULK_SCOPE_MISMATCH');
  }
}
