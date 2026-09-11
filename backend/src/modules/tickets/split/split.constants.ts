export const defaultTicketSplitConfiguration = {
  enabled: true,
  allowAttachmentMove: false,
  allowMessageCopy: true,
  requireReason: true,
} as const;

export const ticketSplitConstants = {
  minimumChildren: 2,
  maximumChildren: 10,
  maximumReasonLength: 2000,
} as const;
