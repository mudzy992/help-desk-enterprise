import type { AutoAssignStrategy } from '../../../generated/prisma/enums';
import type { RoutingOutcome } from '../../routing/routing.types';

/** Requester-safe: no internal rule or unit ids, only what a person deciding whether to submit needs. */
export type TicketRoutingPreview = {
  readonly outcome: RoutingOutcome;
  readonly groupName: string | null;
  readonly fallbackDepth: number;
  readonly autoAssign: AutoAssignStrategy;
  /** 0 or 1 (decision F1-5): whether the ticket would need approval before routing. */
  readonly approvalSteps: 0 | 1;
  readonly slaProfileName: string | null;
};
