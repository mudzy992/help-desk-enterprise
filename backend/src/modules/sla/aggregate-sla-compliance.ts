import type {
  SlaComplianceBreakdownRow,
  SlaComplianceProfileMeta,
  SlaComplianceProfileRow,
  SlaComplianceResponse,
  SlaComplianceTicketRow,
  SlaComplianceWindow,
  SlaOpenBreachCounts,
} from './sla-compliance.types';

export const defaultSlaComplianceWindowDays = 30;

const terminalStatuses = new Set(['RESOLVED', 'CLOSED', 'ARCHIVED']);

type DimensionValue = {
  readonly id: string | null;
  readonly name: string | null;
};

type ComplianceTotals = {
  readonly sampleCount: number;
  readonly responseCompliancePercent: number | null;
  readonly resolutionCompliancePercent: number | null;
};

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
  readonly openBreached: SlaOpenBreachCounts;
}): SlaComplianceResponse {
  const sortedProfiles = [...input.profiles].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const profileById = new Map(sortedProfiles.map((profile) => [profile.id, profile]));
  const eligible = input.rows.filter(
    (row) =>
      profileById.has(row.slaProfileId) &&
      terminalStatuses.has(row.status) &&
      isCompletionInWindow(row.completionAt, input.window),
  );
  const byProfileId = groupBy(eligible, (row) => row.slaProfileId);
  const profiles = sortedProfiles.map((profile) =>
    toProfileRow(profile, byProfileId.get(profile.id) ?? []),
  );

  return {
    window: {
      from: input.window.from.toISOString(),
      to: input.window.to.toISOString(),
    },
    profiles,
    byUnit: buildBreakdownRows(eligible, sortedProfiles, (row) => ({
      id: row.originUnitId,
      name: row.originUnitName,
    })),
    byService: buildBreakdownRows(eligible, sortedProfiles, (row) => ({
      id: row.serviceId,
      name: row.serviceName,
    })),
    byGroup: buildBreakdownRows(eligible, sortedProfiles, (row) => ({
      id: row.assignedGroupId,
      name: row.assignedGroupName,
    })),
    openBreached: input.openBreached,
  };
}

function toProfileRow(
  profile: SlaComplianceProfileMeta,
  rows: readonly SlaComplianceTicketRow[],
): SlaComplianceProfileRow {
  const totals = calculateCompliance(rows);
  return {
    slaProfileId: profile.id,
    profileKey: profile.key,
    profileName: profile.name,
    ...totals,
  };
}

function buildBreakdownRows(
  rows: readonly SlaComplianceTicketRow[],
  profiles: readonly SlaComplianceProfileMeta[],
  dimensionFor: (row: SlaComplianceTicketRow) => DimensionValue,
): readonly SlaComplianceBreakdownRow[] {
  const byProfile = new Map<string, Map<string | null, SlaComplianceTicketRow[]>>();
  const namesByProfile = new Map<string, Map<string | null, string | null>>();
  for (const row of rows) {
    const dimension = dimensionFor(row);
    const groups = byProfile.get(row.slaProfileId) ?? new Map();
    const dimensionRows = groups.get(dimension.id) ?? [];
    dimensionRows.push(row);
    groups.set(dimension.id, dimensionRows);
    byProfile.set(row.slaProfileId, groups);

    const names = namesByProfile.get(row.slaProfileId) ?? new Map();
    names.set(dimension.id, dimension.name);
    namesByProfile.set(row.slaProfileId, names);
  }

  return profiles.flatMap((profile) => {
    const groups = byProfile.get(profile.id);
    if (groups === undefined) {
      return [];
    }
    return [...groups.entries()]
      .map(([dimensionId, dimensionRows]) => ({
        slaProfileId: profile.id,
        dimensionId,
        dimensionName: namesByProfile.get(profile.id)?.get(dimensionId) ?? null,
        ...calculateCompliance(dimensionRows),
      }))
      .sort((left, right) =>
        (left.dimensionName ?? left.dimensionId ?? '').localeCompare(
          right.dimensionName ?? right.dimensionId ?? '',
        ),
      );
  });
}

function calculateCompliance(
  rows: readonly SlaComplianceTicketRow[],
): ComplianceTotals {
  const sampleCount = rows.length;
  if (sampleCount === 0) {
    return {
      sampleCount: 0,
      responseCompliancePercent: null,
      resolutionCompliancePercent: null,
    };
  }
  const responseMet = rows.filter((row) => !row.isResponseBreached).length;
  const resolutionMet = rows.filter((row) => !row.isResolutionBreached).length;
  return {
    sampleCount,
    responseCompliancePercent: Math.round((responseMet / sampleCount) * 100),
    resolutionCompliancePercent: Math.round((resolutionMet / sampleCount) * 100),
  };
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const current = grouped.get(key) ?? [];
    current.push(value);
    grouped.set(key, current);
  }
  return grouped;
}
