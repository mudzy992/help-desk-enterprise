export type SlaComplianceWindow = {
  readonly from: Date;
  readonly to: Date;
};

export type SlaComplianceProfileMeta = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
};

export type SlaComplianceTicketRow = {
  readonly slaProfileId: string;
  readonly isResponseBreached: boolean;
  readonly isResolutionBreached: boolean;
  readonly completionAt: Date;
  readonly status: string;
  readonly originUnitId: string;
  readonly originUnitName: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly assignedGroupId: string | null;
  readonly assignedGroupName: string | null;
};

export type SlaComplianceProfileRow = {
  readonly slaProfileId: string;
  readonly profileKey: string;
  readonly profileName: string;
  readonly sampleCount: number;
  readonly responseCompliancePercent: number | null;
  readonly resolutionCompliancePercent: number | null;
};

/** One SLA profile's terminal-ticket compliance within a report dimension. */
export type SlaComplianceBreakdownRow = {
  readonly slaProfileId: string;
  readonly dimensionId: string | null;
  readonly dimensionName: string | null;
  readonly sampleCount: number;
  readonly responseCompliancePercent: number | null;
  readonly resolutionCompliancePercent: number | null;
};

export type SlaOpenBreachCounts = {
  readonly response: number;
  readonly resolution: number;
};

export type SlaComplianceResponse = {
  readonly window: { readonly from: string; readonly to: string };
  readonly profiles: readonly SlaComplianceProfileRow[];
  readonly byUnit: readonly SlaComplianceBreakdownRow[];
  readonly byService: readonly SlaComplianceBreakdownRow[];
  readonly byGroup: readonly SlaComplianceBreakdownRow[];
  readonly openBreached: SlaOpenBreachCounts;
};
