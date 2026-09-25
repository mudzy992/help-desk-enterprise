import type { MessageType, ParticipantRole } from '../../generated/prisma/enums';
import {
  defaultTicketCollaborationConfiguration,
  messageTypes,
  participantRoles,
} from './collaboration.constants';
import type { TicketCollaborationConfiguration } from './collaboration.types';
import { TicketsError } from './tickets.error';

export function parseTicketCollaborationConfiguration(input: {
  readonly participantsEnabled: unknown;
  readonly defaultParticipantRolesCsv: unknown;
  readonly messageTypesEnabled: unknown;
  readonly allowedMessageTypesCsv: unknown;
}): TicketCollaborationConfiguration {
  if (
    typeof input.participantsEnabled !== 'boolean' ||
    typeof input.defaultParticipantRolesCsv !== 'string' ||
    typeof input.messageTypesEnabled !== 'boolean' ||
    typeof input.allowedMessageTypesCsv !== 'string'
  ) {
    return { ...defaultTicketCollaborationConfiguration };
  }
  return {
    participantsEnabled: input.participantsEnabled,
    defaultParticipantRoles: parseRoles(input.defaultParticipantRolesCsv),
    messageTypesEnabled: input.messageTypesEnabled,
    allowedMessageTypes: parseMessageTypes(input.allowedMessageTypesCsv),
  };
}

function parseRoles(value: string): readonly ParticipantRole[] {
  const parsed = splitCsv(value).filter((item): item is ParticipantRole =>
    (participantRoles as readonly string[]).includes(item),
  );
  return parsed.length > 0
    ? parsed
    : defaultTicketCollaborationConfiguration.defaultParticipantRoles;
}

function parseMessageTypes(value: string): readonly MessageType[] {
  const parsed = splitCsv(value).filter((item): item is MessageType =>
    messageTypes.includes(item as MessageType),
  );
  return parsed.length > 0
    ? parsed
    : defaultTicketCollaborationConfiguration.allowedMessageTypes;
}

function splitCsv(value: string): readonly string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function requireParticipantsEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new TicketsError('PARTICIPANTS_DISABLED');
  }
}

export function requireMessageTypesEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new TicketsError('CHAT_MESSAGE_TYPES_DISABLED');
  }
}
