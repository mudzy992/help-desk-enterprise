import type {
  SlaComplianceProfileMeta,
  SlaComplianceProfileRow,
  SlaComplianceResponse,
  SlaComplianceTicketRow,
  SlaComplianceWindow,
} from './sla-compliance.types';

export const defaultSlaComplianceWindowDays = 30;

export function resolveSlaComplianceWindow(input: {
  readonly days?: number;
  readonly now: Date;
}): SlaComplianceWindow {
  const days = input.days ?? defaultSlaComplianceWindowDays;
  return {
    from: new Date(input.now.getTime() - days * 24 * 60 * 60 * 1000),
    to: input.now,
  };
}

export function isCompletionInWindow(
  completionAt: Date,
  window: SlaComplianceWindow,
): boolean {
  const time = completionAt.getTime();
  return time >= window.from.getTime() && time <= window.to.getTime();
}

export function aggregateSlaCompliance(input: {
  readonly profiles: readonly SlaComplianceProfileMeta[];
  readonly rows: readonly SlaComplianceTicketRow[];
  readonly window: SlaComplianceWindow;
}): SlaComplianceResponse {
  const eligible = input.rows.filter((row) =>
    isCompletionInWindow(row.completionAt, input.window),
  );
  const byProfileId = new Map<string, SlaComplianceTicketRow[]>();
  for (const row of eligible) {
    const current = byProfileId.get(row.slaProfileId) ?? [];
    current.push(row);
    byProfileId.set(row.slaProfileId, current);
  }
  const profiles = [...input.profiles]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((profile) =>
      toProfileRow(profile, byProfileId.get(profile.id) ?? []),
    );
  return {
    window: {
      from: input.window.from.toISOString(),
      to: input.window.to.toISOString(),
    },
    profiles,
  };
}

function toProfileRow(
  profile: SlaComplianceProfileMeta,
  rows: readonly SlaComplianceTicketRow[],
): SlaComplianceProfileRow {
  const sampleCount = rows.length;
  if (sampleCount === 0) {
    return {
      slaProfileId: profile.id,
      profileKey: profile.key,
      profileName: profile.name,
      sampleCount: 0,
      responseCompliancePercent: null,
      resolutionCompliancePercent: null,
    };
  }
  const responseMet = rows.filter((row) => !row.isResponseBreached).length;
  const resolutionMet = rows.filter((row) => !row.isResolutionBreached).length;
  return {
    slaProfileId: profile.id,
    profileKey: profile.key,
    profileName: profile.name,
    sampleCount,
    responseCompliancePercent: Math.round((responseMet / sampleCount) * 100),
    resolutionCompliancePercent: Math.round(
      (resolutionMet / sampleCount) * 100,
    ),
  };
}
