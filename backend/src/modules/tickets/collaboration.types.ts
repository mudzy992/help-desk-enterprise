import type {
  MessageType,
  ParticipantRole,
} from '../../generated/prisma/enums';
import type { RedactionMatch } from './redaction/redaction.types';

export type TicketParticipantRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly role: ParticipantRole;
  readonly userId: string | null;
  readonly groupId: string | null;
  readonly createdAt: Date;
};

export type TicketParticipantResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly role: ParticipantRole;
  readonly userId: string | null;
  readonly groupId: string | null;
  readonly createdAt: string;
};

export type AddTicketParticipantInput = {
  readonly role: ParticipantRole;
  readonly userId?: string;
  readonly groupId?: string;
};

export type TicketMessageRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly type: MessageType;
  readonly body: string;
  readonly authorUserId: string | null;
  readonly createdAt: Date;
};

export type TicketMessageResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly type: MessageType;
  readonly body: string;
  readonly authorUserId: string | null;
  readonly createdAt: string;
  readonly redactionWarnings?: readonly RedactionMatch[];
};

export type CreateTicketMessageInput = {
  readonly type: MessageType;
  readonly body: string;
};

export type TicketTimeLogRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly durationSeconds: number | null;
  readonly createdAt: Date;
};

export type TicketTimeLogResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
  readonly createdAt: string;
};

export type TicketMessageVisibility = 'public' | 'staff';

export type TicketActorAccess = {
  readonly visibility: TicketMessageVisibility;
};

export type TicketCollaborationConfiguration = {
  readonly participantsEnabled: boolean;
  readonly defaultParticipantRoles: readonly ParticipantRole[];
  readonly messageTypesEnabled: boolean;
  readonly allowedMessageTypes: readonly MessageType[];
};

export type TicketRealtimeMessagePayload = TicketMessageResponse & {
  readonly requesterId: string;
  readonly assignedGroupId: string | null;
  readonly visibility: TicketMessageVisibility;
};

export type TicketPersistedMessageSink = TicketMessageRecord[];
