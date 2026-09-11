export const defaultTicketArchiveConfiguration = {
  enabled: true,
  afterClosedDays: 30,
  archivedReadOnly: true,
  searchable: true,
} as const;

export const ticketArchiveAutomationIntervalMs = 15 * 60 * 1000;
