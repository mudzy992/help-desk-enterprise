import type { ReportExportRow } from '../reports.types';

/**
 * Paket 3.2 C9b: CMDB report packs. Pure builders over pre-loaded rows, shared
 * by the report packs (2.5: preview, export, schedules) and by the asset
 * manager overview. Inventory, expiry, licence and holder packs are
 * snapshots at generation time; only "top tickets" uses the report period.
 */

export type AssetInventoryRecord = {
  readonly unitName: string;
  readonly typeName: string;
  readonly status: string;
  readonly count: number;
};

export type AssetExpiringRecord = {
  readonly kind: 'warranty' | 'contract' | 'license';
  readonly name: string;
  readonly reference: string | null;
  readonly unitName: string;
  readonly endsAt: Date;
};

export type AssetLicenseRecord = {
  readonly productName: string;
  readonly vendor: string | null;
  readonly kind: string;
  readonly unitName: string;
  /** Null = site licence (not counted). */
  readonly seats: number | null;
  readonly used: number;
  readonly validUntil: Date | null;
};

export type AssetTicketLinkRecord = {
  readonly assetId: string;
  readonly assetTag: string;
  readonly assetName: string;
  readonly typeName: string;
  readonly unitName: string;
  readonly ticketId: string;
  readonly isOpen: boolean;
};

export type AssetHolderRecord = {
  readonly assetTag: string;
  readonly assetName: string;
  readonly holderName: string;
  readonly holderActive: boolean;
  readonly holderUnitPath: string | null;
  readonly holderUnitName: string | null;
  readonly assetUnitPath: string;
  readonly assetUnitName: string;
};

export type AssetReportData = {
  /** Generation time; expiry horizons count from here. */
  readonly now: Date;
  readonly inventory: readonly AssetInventoryRecord[];
  readonly expiring: readonly AssetExpiringRecord[];
  readonly licenses: readonly AssetLicenseRecord[];
  readonly ticketLinks: readonly AssetTicketLinkRecord[];
  readonly holders: readonly AssetHolderRecord[];
};

export const assetReportHorizonDays = 90;
export const assetTopTicketsLimit = 50;

export const emptyAssetReportData: AssetReportData = {
  now: new Date(0),
  inventory: [],
  expiring: [],
  licenses: [],
  ticketLinks: [],
  holders: [],
};

const dayMs = 86_400_000;

function isoDate(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / dayMs);
}

const collator = new Intl.Collator('bs', { sensitivity: 'base' });

// ------------------------------------------------------------ asset_inventory

export const assetInventoryColumns = ['organizationalUnit', 'assetType', 'status', 'count'] as const;

export function buildAssetInventoryReport(data: AssetReportData): ReportExportRow[] {
  return [...data.inventory]
    .sort(
      (left, right) =>
        collator.compare(left.unitName, right.unitName) ||
        collator.compare(left.typeName, right.typeName) ||
        left.status.localeCompare(right.status),
    )
    .map((record) => ({
      organizationalUnit: record.unitName,
      assetType: record.typeName,
      status: record.status,
      count: record.count,
    }));
}

// ------------------------------------------------------------ asset_expiring

export const assetExpiringColumns = ['kind', 'name', 'reference', 'organizationalUnit', 'endsAt', 'daysLeft'] as const;

/** Everything ending from today up to `horizonDays` ahead, soonest first. */
export function selectExpiring(data: AssetReportData, horizonDays: number): AssetExpiringRecord[] {
  const start = new Date(Date.UTC(data.now.getUTCFullYear(), data.now.getUTCMonth(), data.now.getUTCDate()));
  const end = start.getTime() + horizonDays * dayMs;
  return data.expiring
    .filter((record) => record.endsAt.getTime() >= start.getTime() && record.endsAt.getTime() <= end)
    .sort((left, right) => left.endsAt.getTime() - right.endsAt.getTime() || collator.compare(left.name, right.name));
}

export function buildAssetExpiringReport(data: AssetReportData): ReportExportRow[] {
  return selectExpiring(data, assetReportHorizonDays).map((record) => ({
    kind: record.kind,
    name: record.name,
    reference: record.reference,
    organizationalUnit: record.unitName,
    endsAt: isoDate(record.endsAt),
    daysLeft: Math.max(0, daysBetween(data.now, record.endsAt)),
  }));
}

// ------------------------------------------------------------ asset_license_compliance

export const assetLicenseComplianceColumns = [
  'product',
  'vendor',
  'kind',
  'organizationalUnit',
  'seats',
  'used',
  'free',
  'over',
  'validUntil',
] as const;

export function buildAssetLicenseComplianceReport(data: AssetReportData): ReportExportRow[] {
  return [...data.licenses]
    .map((record) => {
      const counted = record.seats !== null;
      const over = counted ? Math.max(0, record.used - (record.seats ?? 0)) : 0;
      return { record, over };
    })
    // Over-allocated first, then by name: the compliance question comes first.
    .sort((left, right) => right.over - left.over || collator.compare(left.record.productName, right.record.productName))
    .map(({ record, over }) => ({
      product: record.productName,
      vendor: record.vendor,
      kind: record.kind,
      organizationalUnit: record.unitName,
      seats: record.seats,
      used: record.used,
      free: record.seats === null ? null : Math.max(0, record.seats - record.used),
      over,
      validUntil: isoDate(record.validUntil),
    }));
}

export function overAllocatedLicenses(data: AssetReportData): AssetLicenseRecord[] {
  return data.licenses.filter((record) => record.seats !== null && record.used > record.seats);
}

// ------------------------------------------------------------ asset_top_tickets

export const assetTopTicketsColumns = ['assetTag', 'assetName', 'assetType', 'organizationalUnit', 'tickets', 'openTickets'] as const;

export type AssetTicketTotals = {
  readonly assetId: string;
  readonly assetTag: string;
  readonly assetName: string;
  readonly typeName: string;
  readonly unitName: string;
  readonly tickets: number;
  readonly openTickets: number;
};

export function rankAssetsByTickets(data: AssetReportData, limit: number): AssetTicketTotals[] {
  const totals = new Map<string, { base: AssetTicketLinkRecord; tickets: Set<string>; open: Set<string> }>();
  for (const link of data.ticketLinks) {
    const entry = totals.get(link.assetId) ?? { base: link, tickets: new Set<string>(), open: new Set<string>() };
    entry.tickets.add(link.ticketId);
    if (link.isOpen) entry.open.add(link.ticketId);
    totals.set(link.assetId, entry);
  }
  return [...totals.values()]
    .map(({ base, tickets, open }) => ({
      assetId: base.assetId,
      assetTag: base.assetTag,
      assetName: base.assetName,
      typeName: base.typeName,
      unitName: base.unitName,
      tickets: tickets.size,
      openTickets: open.size,
    }))
    .sort((left, right) => right.tickets - left.tickets || right.openTickets - left.openTickets || left.assetTag.localeCompare(right.assetTag))
    .slice(0, limit);
}

export function buildAssetTopTicketsReport(data: AssetReportData): ReportExportRow[] {
  return rankAssetsByTickets(data, assetTopTicketsLimit).map((entry) => ({
    assetTag: entry.assetTag,
    assetName: entry.assetName,
    assetType: entry.typeName,
    organizationalUnit: entry.unitName,
    tickets: entry.tickets,
    openTickets: entry.openTickets,
  }));
}

// ------------------------------------------------------------ asset_inactive_holders

export const assetInactiveHoldersColumns = ['assetTag', 'assetName', 'holder', 'reason', 'holderUnit', 'assetUnit'] as const;

export type HolderProblem = AssetHolderRecord & { readonly reason: 'inactive' | 'other_unit' };

function isInSubtree(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Equipment held by a deactivated user, or by a user whose unit is outside the
 * unit of the equipment (a move to a sub-unit is not a problem).
 */
export function selectHolderProblems(data: AssetReportData): HolderProblem[] {
  const problems: HolderProblem[] = [];
  for (const record of data.holders) {
    if (!record.holderActive) problems.push({ ...record, reason: 'inactive' });
    else if (record.holderUnitPath !== null && !isInSubtree(record.holderUnitPath, record.assetUnitPath)) problems.push({ ...record, reason: 'other_unit' });
  }
  return problems.sort((left, right) => left.reason.localeCompare(right.reason) || left.assetTag.localeCompare(right.assetTag));
}

export function buildAssetInactiveHoldersReport(data: AssetReportData): ReportExportRow[] {
  return selectHolderProblems(data).map((record) => ({
    assetTag: record.assetTag,
    assetName: record.assetName,
    holder: record.holderName,
    reason: record.reason,
    holderUnit: record.holderUnitName,
    assetUnit: record.assetUnitName,
  }));
}
