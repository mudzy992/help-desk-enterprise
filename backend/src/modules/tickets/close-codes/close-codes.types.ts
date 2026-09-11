export type TicketCloseCodesConfiguration = {
  readonly enabled: boolean;
  readonly allowedCodes: readonly string[];
  readonly requireOnResolve: boolean;
};

export type CloseCodeRecord = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly serviceId: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CloseCodeDescriptor = {
  readonly key: string;
  readonly name: string;
};

export type TicketClosePolicy = {
  readonly enabled: boolean;
  readonly requireOnResolve: boolean;
  readonly allowedCodes: readonly CloseCodeDescriptor[];
  readonly closeCode: CloseCodeDescriptor | null;
  readonly resolutionNote: string | null;
};
