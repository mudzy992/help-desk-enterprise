import { permissionKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { TicketsError } from '../tickets.error';
import { closedBulkStatuses } from './bulk.constants';
import type {
  ExecuteTicketBulkInput,
  TicketBulkActionType,
  TicketBulkConfiguration,
} from './bulk.types';

const permissionByAction: Readonly<Record<TicketBulkActionType, string>> = {
  assign_group: permissionKeys.ticketBulkAssign,
  assign_user: permissionKeys.ticketBulkAssign,
  set_status: permissionKeys.ticketBulkStatusUpdate,
  set_priority: permissionKeys.ticketBulkPriorityUpdate,
  broadcast_message: permissionKeys.ticketBulkBroadcast,
  merge_into_parent: permissionKeys.ticketMerge,
};

export function assertBulkActionAllowed(input: {
  readonly context: AuthorizationContext;
  readonly configuration: TicketBulkConfiguration;
  readonly body: ExecuteTicketBulkInput;
}): void {
  if (!input.configuration.enabled) {
    throw new TicketsError('BULK_DISABLED');
  }
  if (!input.configuration.allowedActionTypes.includes(input.body.actionType)) {
    throw new TicketsError('BULK_ACTION_NOT_ALLOWED');
  }
  if (
    input.body.actionType === 'set_status' &&
    input.body.status !== undefined &&
    closedBulkStatuses.includes(
      input.body.status as (typeof closedBulkStatuses)[number],
    )
  ) {
    throw new TicketsError('BULK_CLOSE_FORBIDDEN');
  }
  const required = permissionByAction[input.body.actionType];
  if (input.context.isSuperAdmin) {
    return;
  }
  const granted = input.context.assignments.some((assignment) =>
    assignment.permissionKeys.includes(required),
  );
  if (!granted) {
    throw new TicketsError('FORBIDDEN');
  }
}
