import type {
  BusinessHoursCalendarResponse,
  WeeklyHours,
} from '../sla/sla.types';
import type { PriorityMatrixResponse } from '../sla/list-priority-matrix';
import type {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../generated/prisma/enums';

/** F4.4: „Potvrđujem podrazumijevano“ or an actual change. */
export type InstallSlaReviewOutcome = 'confirmed' | 'adjusted';

export type InstallSlaReviewStatus = {
  readonly review: InstallSlaReviewOutcome | null;
  /** The `BH_STANDARD` calendar the seeded SLA profiles use. */
  readonly calendar: BusinessHoursCalendarResponse | null;
  readonly matrix: PriorityMatrixResponse;
};

export type InstallSlaReviewCalendarInput = {
  readonly name?: string;
  readonly timezone?: string;
  readonly weeklyHours?: WeeklyHours;
  readonly isActive?: boolean;
};

export type InstallSlaReviewCellInput = {
  readonly impact: TicketImpact;
  readonly urgency: TicketUrgency;
  readonly priority: TicketPriority;
};

export type InstallSlaReviewInput = {
  readonly outcome: InstallSlaReviewOutcome;
  readonly calendar?: InstallSlaReviewCalendarInput;
  readonly cells?: readonly InstallSlaReviewCellInput[];
};

export type InstallSlaReviewResult = InstallSlaReviewStatus & {
  readonly calendarUpdated: boolean;
  readonly matrixUpdated: boolean;
};
