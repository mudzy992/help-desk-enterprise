import type { TicketStatus } from '../../../generated/prisma/enums';

/** Package 1.2: merge and manual priority rules (plan §3–§4). */
export const ticketMergeConstants = {
  /** Same as the bulk selection limit (M1). */
  maximumChildren: 50,
  minimumReasonLength: 3,
  maximumReasonLength: 500,
  maximumCandidates: 10,
} as const;

/** Neither a parent nor a child may be in one of these (M1). */
export const nonMergeableTicketStatuses: readonly TicketStatus[] = [
  'CLOSED',
  'ARCHIVED',
];

/** A priority cannot be changed in these statuses (P2). */
export const priorityLockedTicketStatuses: readonly TicketStatus[] = [
  'CLOSED',
  'ARCHIVED',
];

/** Parent statuses a merged child takes over (M3); reopen is handled apart. */
export const propagatedParentStatuses: readonly TicketStatus[] = [
  'RESOLVED',
  'CLOSED',
];

export const terminalTicketStatuses: readonly TicketStatus[] = [
  'RESOLVED',
  'CLOSED',
  'ARCHIVED',
];

/**
 * Public texts written on child tickets. The deployment language is Bosnian
 * (all e-mail templates of package 1.5 default to bs); the text is plain so it
 * reads well in the in-app thread and in the e-mail excerpt alike.
 */
export const ticketMergeTexts = {
  childMerged: (parentNumber: string) =>
    `Vaš zahtjev je spojen s ${parentNumber} jer se odnosi na isti problem. Obavijesti o rješavanju ćete dobijati i dalje.`,
  copiedFromParent: (parentNumber: string, body: string) =>
    `Poruka s ${parentNumber}:\n\n${body}`,
} as const;
