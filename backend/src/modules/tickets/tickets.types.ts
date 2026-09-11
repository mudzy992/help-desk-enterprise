import type {
  DataClassification,
  TicketImpact,
  TicketPriority,
  TicketStatus,
  TicketUrgency,
} from '../../generated/prisma/enums';
import type { JsonValue } from '../change-log/change-log.types';

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
  readonly createdAt: string;
  readonly updatedAt: string;
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
};

export type UpdateTicketInput = {
  readonly title?: string;
  readonly description?: string;
  readonly impact?: TicketImpact;
  readonly urgency?: TicketUrgency;
  readonly status?: TicketStatus;
  readonly formData?: unknown;
};

export type ListTicketsQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
  readonly status?: TicketStatus;
};

export type TicketMutationContext = {
  readonly actorUserId: string;
};
