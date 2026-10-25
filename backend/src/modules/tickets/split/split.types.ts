import type { TicketResponse } from '../tickets.types';

export type TicketSplitConfiguration = {
  readonly enabled: boolean;
  readonly allowAttachmentMove: boolean;
  readonly allowMessageCopy: boolean;
  readonly requireReason: boolean;
};

export type SplitTicketChildInput = {
  readonly title?: string;
  readonly description?: string;
  readonly serviceId?: string;
  readonly assignedGroupId?: string;
  readonly messageIds?: readonly string[];
  readonly attachmentIds?: readonly string[];
  readonly moveAttachments?: boolean;
};

export type SplitTicketInput = {
  /** Required by the HTTP DTO; optional only for legacy in-memory harness callers. */
  readonly operationId?: string;
  readonly reason?: string;
  readonly children: readonly SplitTicketChildInput[];
};

export type SplitTicketResult = {
  readonly parent: TicketResponse;
  readonly children: readonly TicketResponse[];
};
