import type { MessageType } from '../../generated/prisma/enums';
import {
  clientCreatableMessageTypes,
  staffOnlyMessageTypes,
} from './collaboration.constants';
import type {
  CreateTicketMessageInput,
  TicketActorAccess,
  TicketCollaborationConfiguration,
} from './collaboration.types';
import { ticketConstants } from './tickets.constants';
import { TicketsError } from './tickets.error';

export function normalizeTicketMessageInput(
  input: CreateTicketMessageInput,
  access: TicketActorAccess,
  configuration: TicketCollaborationConfiguration,
): { readonly type: MessageType; readonly body: string } {
  const body = input.body.trim();
  if (
    body.length === 0 ||
    body.length > ticketConstants.maximumMessageBodyLength
  ) {
    throw new TicketsError('INVALID_MESSAGE_BODY');
  }
  if (
    !clientCreatableMessageTypes.includes(
      input.type as (typeof clientCreatableMessageTypes)[number],
    )
  ) {
    throw new TicketsError('INVALID_MESSAGE_TYPE');
  }
  if (!configuration.allowedMessageTypes.includes(input.type)) {
    throw new TicketsError('INVALID_MESSAGE_TYPE');
  }
  if (
    staffOnlyMessageTypes.includes(
      input.type as (typeof staffOnlyMessageTypes)[number],
    )
  ) {
    if (!configuration.messageTypesEnabled) {
      throw new TicketsError('CHAT_MESSAGE_TYPES_DISABLED');
    }
    if (access.visibility !== 'staff') {
      throw new TicketsError('MESSAGE_TYPE_NOT_ALLOWED');
    }
  }
  if (input.type === 'AGENT_REPLY' && access.visibility !== 'staff') {
    throw new TicketsError('MESSAGE_TYPE_NOT_ALLOWED');
  }
  if (input.type === 'USER_REPLY' && access.visibility === 'staff') {
    throw new TicketsError('MESSAGE_TYPE_NOT_ALLOWED');
  }
  return { type: input.type, body };
}
