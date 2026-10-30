import type { Prisma } from '../../../generated/prisma/client';
import { ticketResponseRelations } from '../ticket-response-relations';

/**
 * Projection of the ticket list (plan §1.1: "u `findMany` dodati `select` samo
 * kolona potrebnih za listni prikaz").
 *
 * It keeps every scalar the list DTO and its client mappers read, minus
 * `formData`: a JSON blob per service request that is rendered only on the
 * ticket detail screen. The small response relations are selected here too;
 * `relationLoadStrategy: 'join'` lets Prisma fetch labels, parent summaries,
 * close code, SLA and CSAT with the page rather than issuing follow-up reads.
 * `description` stays because list search and the client-side filter still
 * read it; it can be dropped once list search is server-side everywhere.
 */
export const ticketListSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  impact: true,
  urgency: true,
  classification: true,
  isConfidential: true,
  originUnitId: true,
  serviceId: true,
  formVersionId: true,
  requesterId: true,
  assignedGroupId: true,
  assignedUserId: true,
  parentTicketId: true,
  mergedIntoTicketId: true,
  reopenedFromTicketId: true,
  closeCodeId: true,
  resolutionNote: true,
  resolvedAt: true,
  closedAt: true,
  archivedAt: true,
  waitingForUserEnteredAt: true,
  waitingForUserReminderSentAt: true,
  firstResponseAt: true,
  forwardCount: true,
  lastForwardedAt: true,
  lastForwardFromGroupName: true,
  routedByUnroutedFallback: true,
  priorityOverridden: true,
  mergedAt: true,
  createdAt: true,
  updatedAt: true,
  ...ticketResponseRelations,
} satisfies Prisma.TicketSelect;
