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
  /** Paket 2.3: absent on records selected without the column. */
  readonly source?: 'APP' | 'EMAIL';
  /** Paket 2.6: set when anonymization replaced names in the body. */
  readonly redactedAt?: Date | null;
};

export type TicketMessageResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly type: MessageType;
  readonly body: string;
  readonly authorUserId: string | null;
  readonly createdAt: string;
  /** Paket 2.3: `EMAIL` when the message arrived as an e-mail reply. */
  readonly source?: 'APP' | 'EMAIL';
  readonly redactionWarnings?: readonly RedactionMatch[];
  /** Paket 2.6: names in the body were replaced by a pseudonym (anonymization). */
  readonly redacted?: boolean;
};

export type CreateTicketMessageInput = {
  readonly type: MessageType;
  readonly body: string;
  /** Package 1.2 (M4): copy a public agent reply to merged child tickets. */
  readonly alsoToMerged?: boolean;
  /** Package 1.4 (T4): the template the text started from (statistics only). */
  readonly responseTemplateId?: string;
};

export type TicketTimeLogRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly durationSeconds: number | null;
  readonly createdAt: Date;
  /** Package 1.3 (T2); optional so pre-1.3 fixtures stay valid. */
  readonly source?: TimeLogSource;
  readonly stopReason?: TimeLogStopReason | null;
  readonly lastHeartbeatAt?: Date | null;
  readonly note?: string | null;
  readonly correctedAt?: Date | null;
  readonly correctedByUserId?: string | null;
  readonly correctionReason?: string | null;
  readonly deletedAt?: Date | null;
  readonly deletedByUserId?: string | null;
  readonly deleteReason?: string | null;
};

export type TimeLogSource = 'TIMER' | 'MANUAL';
export type TimeLogStopReason =
  | 'MANUAL'
  | 'AUTO_IDLE'
  | 'AUTO_MAX_DURATION'
  | 'AUTO_TICKET_CLOSED'
  | 'AUTO_SWITCHED';

export type TicketTimeLogResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationSeconds: number | null;
  readonly createdAt: string;
  readonly source: TimeLogSource;
  readonly stopReason: TimeLogStopReason | null;
  readonly note: string | null;
  readonly correctedAt: string | null;
  readonly correctedByUserId: string | null;
  readonly correctionReason: string | null;
  readonly deletedAt: string | null;
  readonly deletedByUserId: string | null;
  readonly deleteReason: string | null;
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
