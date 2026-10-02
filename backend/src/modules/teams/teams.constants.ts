/** Paket 3.1: event keys a group channel can receive (design §12). */
export const teamsChannelEvents = [
  'ticket.created_in_group',
  'ticket.assigned_in_group',
  'sla.warning',
  'sla.breached',
] as const;
export type TeamsChannelEvent = (typeof teamsChannelEvents)[number];
export const defaultTeamsChannelEvents: readonly TeamsChannelEvent[] = ['ticket.created_in_group', 'sla.breached'];

/** Action.Execute verbs. T2 handles linking; ticket/approval/CAB verbs arrive in T4. */
export const teamsVerbs = {
  linkGroup: 'teams.linkGroup',
  claimTicket: 'ticket.claim',
  replyTicket: 'ticket.reply',
  noteTicket: 'ticket.note',
  approveTicket: 'approval.approve',
  rejectTicket: 'approval.reject',
  approveChange: 'change.approve',
  rejectChange: 'change.reject',
  createTicket: 'ticket.create',
  deflectTicket: 'ticket.deflect',
} as const;

/** Simulated activities use this service URL and, without a configured tenant, this tenant. */
export const simulatorTenantId = 'simulator-tenant';
export const maxMyTickets = 5;
/** §20b: list sizes of the command answers (personal / agent lists, approval cards, intercept suggestions). */
export const teamsListLimits = { personal: 5, agent: 10, cards: 5, intercept: 3 } as const;
export const maxLinkableGroups = 50;
