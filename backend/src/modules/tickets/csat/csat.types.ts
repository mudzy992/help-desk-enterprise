export type TicketCsatConfiguration = {
  readonly enabled: boolean;
  readonly scaleMax: number;
  readonly askOnResolved: boolean;
  readonly askOnClosed: boolean;
  readonly samplingRate: number;
};

export type TicketCsatRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly rating: number;
  readonly comment: string | null;
  readonly submittedByUserId: string;
  readonly createdAt: Date;
};

export type TicketCsatDescriptor = {
  readonly enabled: boolean;
  readonly canSubmit: boolean;
  readonly submitted: boolean;
  readonly rating: number | null;
  readonly comment: string | null;
  readonly scaleMax: number;
  readonly askOnResolved: boolean;
  readonly askOnClosed: boolean;
};

export type SubmitTicketCsatInput = {
  readonly rating: number;
  readonly comment?: string;
};

export type TicketCsatGroupKey = 'originUnitId' | 'serviceId' | 'assignedGroupId';

export type TicketCsatBucket = {
  readonly key: string;
  readonly count: number;
  readonly average: number;
};

export type TicketCsatSummary = {
  readonly count: number;
  readonly average: number | null;
  readonly byOriginUnit: readonly TicketCsatBucket[];
  readonly byService: readonly TicketCsatBucket[];
  readonly byGroup: readonly TicketCsatBucket[];
};
