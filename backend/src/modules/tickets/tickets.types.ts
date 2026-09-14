import type {
  DataClassification,
  TicketImpact,
  TicketPriority,
  TicketStatus,
  TicketUrgency,
} from '../../generated/prisma/enums';
import type { TicketClosePolicy } from './close-codes/close-codes.types';
import type { RedactionMatch } from './redaction/redaction.types';
import type { DuplicateTicketMatch } from './guardrails/guardrails.types';
import type { JsonValue } from '../change-log/change-log.types';
import type { TicketArchiveConfiguration } from './archive/archive.types';
import type { TicketCsatDescriptor } from './csat/csat.types';
import type { TicketConfidentialConfiguration } from './confidential/confidential.types';
import type { TicketSafeLoggingConfiguration } from './safe-logging/safe-logging.types';
import type { TicketSlaTimersPort } from '../sla/ticket-sla.types';

export type TicketRecord = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly classification: DataClassification;
  readonly isConfidential: boolean;
  readonly formData: unknown;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly formVersionId: string;
  readonly requesterId: string;
  readonly assignedGroupId: string | null;
  readonly assignedUserId: string | null;
  readonly parentTicketId: string | null;
  readonly mergedIntoTicketId: string | null;
  readonly reopenedFromTicketId: string | null;
  readonly closeCodeId: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedAt: Date | null;
  readonly closedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly waitingForUserEnteredAt: Date | null;
  readonly waitingForUserReminderSentAt: Date | null;
  readonly firstResponseAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TicketResponse = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly classification: DataClassification;
  readonly isConfidential: boolean;
  readonly formData: JsonValue | null;
  readonly originUnitId: string;
  readonly serviceId: string;
  readonly formVersionRef: string;
  readonly requesterId: string;
  readonly assignedGroupId: string | null;
  readonly assignedUserId: string | null;
  readonly parentTicketId: string | null;
  readonly mergedIntoTicketId: string | null;
  readonly reopenedFromTicketId: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly archivedAt: string | null;
  readonly waitingForUserEnteredAt: string | null;
  readonly isOverdue: boolean;
  readonly sla?: TicketSlaClientSnapshot | null;
  readonly reopen?: TicketReopenDescriptor;
  readonly closePolicy?: TicketClosePolicy;
  readonly csat?: TicketCsatDescriptor;
  readonly redactionWarnings?: readonly RedactionMatch[];
  readonly duplicateWarnings?: readonly DuplicateTicketMatch[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TicketSlaClientSnapshot = {
  readonly startedAt: string;
  readonly responseDueAt: string | null;
  readonly resolutionDueAt: string | null;
  readonly respondedAt: string | null;
  readonly resolutionCompletedAt: string | null;
  readonly pausedAt: string | null;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
};

export type TicketReopenDescriptor = {
  readonly enabled: boolean;
  readonly eligible: boolean;
  readonly createsNewTicket: boolean;
  readonly windowEndsAt: string | null;
};

export type CreateTicketInput = {
  readonly title: string;
  readonly description: string;
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly serviceId: string;
  readonly originUnitId?: string;
  readonly formVersionRef?: string;
  readonly formData?: unknown;
  readonly requesterUserId?: string;
  readonly reopenedFromTicketId?: string;
  readonly parentTicketId?: string;
  readonly assignedGroupId?: string;
  readonly classification?: DataClassification;
  readonly isConfidential?: boolean;
  readonly acknowledgeDuplicate?: boolean;
};

export type UpdateTicketInput = {
  readonly title?: string;
  readonly description?: string;
  readonly impact?: TicketImpact;
  readonly urgency?: TicketUrgency;
  readonly status?: TicketStatus;
  readonly formData?: unknown;
  readonly closeCode?: string;
  readonly resolutionNote?: string;
};

export type ListTicketsQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
  readonly status?: TicketStatus;
  readonly assignedUserId?: string;
  readonly priority?: TicketPriority;
  readonly q?: string;
  readonly includeArchived?: boolean;
};

export type TicketMutationContext = {
  readonly actorUserId: string;
  readonly confidential?: TicketConfidentialConfiguration;
  readonly safeLogging?: TicketSafeLoggingConfiguration;
  readonly archive?: TicketArchiveConfiguration;
  readonly slaTimers?: TicketSlaTimersPort;
};
