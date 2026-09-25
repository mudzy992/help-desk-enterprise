import type { Prisma } from '../../../generated/prisma/client';

/**
 * Projection of the ticket list (plan §1.1: "u `findMany` dodati `select` samo
 * kolona potrebnih za listni prikaz").
 *
 * It keeps every column the list DTO and its client mappers read, minus
 * `formData`: a JSON blob per service request that is rendered only on the
 * ticket detail screen, which still loads the full row. `description` stays
 * because the list search and the client-side filter still read it; it can be
 * dropped once the list search is server-side everywhere (phase 3.3).
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TicketSelect;
