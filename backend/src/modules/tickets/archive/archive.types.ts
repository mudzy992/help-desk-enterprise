export type TicketArchiveConfiguration = {
  readonly enabled: boolean;
  readonly afterClosedDays: number;
  readonly archivedReadOnly: boolean;
  readonly searchable: boolean;
};
