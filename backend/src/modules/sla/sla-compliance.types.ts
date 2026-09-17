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
};

export type SlaComplianceProfileRow = {
  readonly slaProfileId: string;
  readonly profileKey: string;
  readonly profileName: string;
  readonly sampleCount: number;
  readonly responseCompliancePercent: number | null;
  readonly resolutionCompliancePercent: number | null;
};

export type SlaComplianceResponse = {
  readonly window: { readonly from: string; readonly to: string };
  readonly profiles: readonly SlaComplianceProfileRow[];
};
