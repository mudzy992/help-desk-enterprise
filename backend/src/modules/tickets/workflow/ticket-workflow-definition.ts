import type { TicketStatus } from '../../../generated/prisma/enums';

/**
 * Package 1.7 (W1): the ticket status flow as data — the single source of truth.
 * `allowedTicketStatusTransitions` is derived from it, so the guards behave
 * exactly as before; the admin "status flow" screen reads the same list.
 */
export type WorkflowActor = 'STAFF' | 'REQUESTER' | 'APPROVER' | 'SYSTEM';

export type WorkflowTrigger =
  | 'status_change'
  | 'claim'
  | 'forward'
  | 'approval'
  | 'reopen'
  | 'automation';

export type WorkflowGuard =
  | 'close_code'
  | 'required_fields'
  | 'resolution_note'
  | 'approval_decision'
  | 'reopen_window'
  | 'waiting_auto_close'
  | 'archive_after'
  | 'group_required'
  /** Package 1.4 (P5): required playbook steps (off / warn / block). */
  | 'playbook_steps';

export type WorkflowPhase = 'intake' | 'work' | 'done';

export type WorkflowTransition = {
  readonly from: TicketStatus;
  readonly to: TicketStatus;
  readonly actors: readonly WorkflowActor[];
  readonly triggers: readonly WorkflowTrigger[];
  readonly guards: readonly WorkflowGuard[];
};

export const workflowStatusPhases: Readonly<Record<TicketStatus, WorkflowPhase>> = {
  UNROUTED: 'intake',
  PENDING_APPROVAL: 'intake',
  PENDING: 'intake',
  ASSIGNED: 'work',
  IN_PROGRESS: 'work',
  WAITING_FOR_USER: 'work',
  RESOLVED: 'done',
  CLOSED: 'done',
  ARCHIVED: 'done',
};

const closing: readonly WorkflowGuard[] = ['close_code', 'required_fields', 'playbook_steps'];

export const ticketWorkflowTransitions: readonly WorkflowTransition[] = [
  { from: 'UNROUTED', to: 'PENDING', actors: ['STAFF'], triggers: ['forward'], guards: ['group_required'] },
  // Review 2026-09-25: spam / duplicates close straight from intake.
  { from: 'UNROUTED', to: 'CLOSED', actors: ['STAFF'], triggers: ['status_change'], guards: closing },
  { from: 'PENDING_APPROVAL', to: 'PENDING', actors: ['APPROVER'], triggers: ['approval'], guards: ['approval_decision'] },
  { from: 'PENDING_APPROVAL', to: 'CLOSED', actors: ['APPROVER'], triggers: ['approval'], guards: ['approval_decision'] },
  { from: 'PENDING', to: 'ASSIGNED', actors: ['STAFF', 'SYSTEM'], triggers: ['claim', 'status_change', 'automation'], guards: [] },
  { from: 'PENDING', to: 'IN_PROGRESS', actors: ['STAFF'], triggers: ['status_change'], guards: [] },
  { from: 'PENDING', to: 'PENDING_APPROVAL', actors: ['SYSTEM'], triggers: ['approval'], guards: [] },
  { from: 'PENDING', to: 'CLOSED', actors: ['STAFF'], triggers: ['status_change'], guards: closing },
  { from: 'ASSIGNED', to: 'IN_PROGRESS', actors: ['STAFF'], triggers: ['status_change'], guards: [] },
  { from: 'ASSIGNED', to: 'PENDING', actors: ['STAFF'], triggers: ['status_change', 'forward'], guards: [] },
  { from: 'ASSIGNED', to: 'WAITING_FOR_USER', actors: ['STAFF'], triggers: ['status_change'], guards: [] },
  { from: 'ASSIGNED', to: 'CLOSED', actors: ['STAFF'], triggers: ['status_change'], guards: closing },
  { from: 'IN_PROGRESS', to: 'WAITING_FOR_USER', actors: ['STAFF'], triggers: ['status_change'], guards: [] },
  { from: 'IN_PROGRESS', to: 'RESOLVED', actors: ['STAFF'], triggers: ['status_change'], guards: [...closing, 'resolution_note'] },
  { from: 'IN_PROGRESS', to: 'ASSIGNED', actors: ['STAFF'], triggers: ['status_change', 'forward'], guards: [] },
  { from: 'WAITING_FOR_USER', to: 'IN_PROGRESS', actors: ['STAFF', 'REQUESTER', 'SYSTEM'], triggers: ['status_change', 'automation'], guards: [] },
  { from: 'WAITING_FOR_USER', to: 'RESOLVED', actors: ['STAFF'], triggers: ['status_change'], guards: [...closing, 'resolution_note'] },
  { from: 'WAITING_FOR_USER', to: 'CLOSED', actors: ['STAFF', 'SYSTEM'], triggers: ['status_change', 'automation'], guards: ['waiting_auto_close', 'playbook_steps'] },
  { from: 'RESOLVED', to: 'CLOSED', actors: ['STAFF', 'SYSTEM'], triggers: ['status_change', 'automation'], guards: [] },
  { from: 'RESOLVED', to: 'IN_PROGRESS', actors: ['REQUESTER', 'STAFF'], triggers: ['reopen'], guards: ['reopen_window'] },
  { from: 'CLOSED', to: 'ARCHIVED', actors: ['SYSTEM'], triggers: ['automation'], guards: ['archive_after'] },
  { from: 'CLOSED', to: 'IN_PROGRESS', actors: ['REQUESTER', 'STAFF'], triggers: ['reopen'], guards: ['reopen_window'] },
];

export function deriveAllowedTransitions(
  statuses: readonly TicketStatus[],
  transitions: readonly WorkflowTransition[] = ticketWorkflowTransitions,
): Readonly<Record<TicketStatus, readonly TicketStatus[]>> {
  const result = Object.fromEntries(statuses.map((status) => [status, [] as TicketStatus[]])) as Record<
    TicketStatus,
    TicketStatus[]
  >;
  for (const transition of transitions) {
    result[transition.from].push(transition.to);
  }
  return result;
}
