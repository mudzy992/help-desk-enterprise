import type { AutoAssignStrategy } from '../../../generated/prisma/enums';

export type EffectiveAutoAssignStrategy = AutoAssignStrategy;

export type TicketAssignmentConfiguration = {
  readonly groupInboxEnabled: boolean;
  readonly autoAssignEnabled: boolean;
  readonly autoAssignStrategy: Exclude<AutoAssignStrategy, 'NONE'>;
};
