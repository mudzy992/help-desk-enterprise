import type { TransferDocumentData, TransferItemData, TransferLocale } from './transfer-document';

/** Paket 3.2 (§7a): pure rules of an equipment move and its transfer record. */

export const assetTransferScenarios = ['WAREHOUSE_TO_USER', 'USER_TO_USER', 'USER_TO_WAREHOUSE'] as const;
export type AssetTransferScenarioValue = (typeof assetTransferScenarios)[number];

export const assetTransferLimits = {
  itemsMax: 50,
  labelMax: 200,
  noteMax: 1000,
  itemNoteMax: 300,
  cancelReasonMin: 5,
  cancelReasonMax: 500,
  signedMaxBytes: 10 * 1024 * 1024,
  listMax: 100,
} as const;

// ------------------------------------------------------------ signatory (§7a.2)

export type SignatoryUnit = { readonly id: string; readonly parentId: string | null };
export type SignatoryEntry = { readonly userId: string; readonly title: string | null; readonly isActive: boolean };

export type ResolvedSignatory =
  | { readonly userId: string; readonly title: string | null; readonly source: 'unit'; readonly unitId: string; readonly inheritedFromUnitId: string | null }
  | { readonly userId: string; readonly title: null; readonly source: 'default' }
  | { readonly userId: null; readonly source: 'none' };

/**
 * Nearest ancestor (the unit itself first) with an active signatory; then the
 * installation default; else none. A deactivated signatory is skipped so the
 * next ancestor applies. Cycles in a broken tree are cut after 64 steps.
 */
export function resolveSignatory(input: {
  readonly unitId: string | null;
  readonly units: ReadonlyMap<string, SignatoryUnit>;
  readonly signatories: ReadonlyMap<string, SignatoryEntry>;
  readonly defaultUserId: string | null;
}): ResolvedSignatory {
  let current = input.unitId;
  for (let step = 0; current !== null && step < 64; step += 1) {
    const entry = input.signatories.get(current);
    if (entry && entry.isActive) {
      return { userId: entry.userId, title: entry.title, source: 'unit', unitId: current, inheritedFromUnitId: current === input.unitId ? null : current };
    }
    current = input.units.get(current)?.parentId ?? null;
  }
  if (input.defaultUserId) return { userId: input.defaultUserId, title: null, source: 'default' };
  return { userId: null, source: 'none' };
}

/** Whose unit decides the signatory: the receiver; on a return, the person handing over. */
export function signatoryUnitOwner(scenario: AssetTransferScenarioValue): 'to' | 'from' {
  return scenario === 'USER_TO_WAREHOUSE' ? 'from' : 'to';
}

// ------------------------------------------------------------ validation of a move

export type MovableAsset = {
  readonly id: string;
  readonly assetTag: string;
  readonly status: string;
  readonly assignedUserId: string | null;
};

export type MoveProblem =
  | { readonly code: 'not_in_stock'; readonly assetTag: string }
  | { readonly code: 'already_assigned'; readonly assetTag: string }
  | { readonly code: 'not_assigned'; readonly assetTag: string }
  | { readonly code: 'different_holders' }
  | { readonly code: 'same_user' }
  | { readonly code: 'receiver_required' }
  | { readonly code: 'return_status' };

const stockStatuses = new Set(['ORDERED', 'IN_STOCK', 'IN_REPAIR']);

export function validateMove(input: {
  readonly scenario: AssetTransferScenarioValue;
  readonly assets: readonly MovableAsset[];
  readonly toUserId: string | null;
  readonly returnStatus: string | null;
}): { readonly problems: MoveProblem[]; readonly fromUserId: string | null } {
  const problems: MoveProblem[] = [];
  const holders = new Set(input.assets.map((asset) => asset.assignedUserId));
  if (input.scenario === 'WAREHOUSE_TO_USER') {
    for (const asset of input.assets) {
      if (asset.assignedUserId !== null) problems.push({ code: 'already_assigned', assetTag: asset.assetTag });
      else if (!stockStatuses.has(asset.status)) problems.push({ code: 'not_in_stock', assetTag: asset.assetTag });
    }
    if (input.toUserId === null) problems.push({ code: 'receiver_required' });
    return { problems, fromUserId: null };
  }
  for (const asset of input.assets) {
    if (asset.assignedUserId === null) problems.push({ code: 'not_assigned', assetTag: asset.assetTag });
  }
  const assignedHolders = [...holders].filter((holder): holder is string => holder !== null);
  if (assignedHolders.length > 1) problems.push({ code: 'different_holders' });
  const fromUserId = assignedHolders.length === 1 ? assignedHolders[0] : null;
  if (input.scenario === 'USER_TO_USER') {
    if (input.toUserId === null) problems.push({ code: 'receiver_required' });
    else if (input.toUserId === fromUserId) problems.push({ code: 'same_user' });
  }
  if (input.scenario === 'USER_TO_WAREHOUSE' && input.returnStatus !== null && !['IN_STOCK', 'IN_REPAIR'].includes(input.returnStatus)) {
    problems.push({ code: 'return_status' });
  }
  return { problems, fromUserId };
}

// ------------------------------------------------------------ snapshot → document data

export type TransferParty = {
  readonly userId: string | null;
  readonly name: string;
  readonly title: string;
  readonly unit: string;
  readonly email: string;
};

export type TransferSnapshotItem = {
  readonly assetId: string;
  readonly name: string;
  readonly assetTag: string;
  readonly serialNumber: string;
  readonly type: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly location: string;
  readonly note: string;
};

/** Everything printed, frozen at issue time (§7a.5). */
export type TransferSnapshot = {
  readonly version: 1;
  readonly locale: TransferLocale;
  readonly number: string;
  readonly scenario: AssetTransferScenarioValue;
  readonly issuedAt: string;
  readonly timeZone: string;
  readonly place: string;
  readonly from: TransferParty;
  readonly to: TransferParty;
  readonly signatory: TransferParty;
  readonly issuedBy: TransferParty;
  readonly note: string;
  readonly items: readonly TransferSnapshotItem[];
};

export const transferScenarioLabels: Readonly<Record<AssetTransferScenarioValue, Record<TransferLocale, string>>> = {
  WAREHOUSE_TO_USER: { bs: 'Zaduženje (skladište → korisnik)', en: 'Assignment (warehouse → user)' },
  USER_TO_USER: { bs: 'Prezaduženje (korisnik → korisnik)', en: 'Reassignment (user → user)' },
  USER_TO_WAREHOUSE: { bs: 'Razduženje (korisnik → skladište)', en: 'Return (user → warehouse)' },
};

export const defaultWarehouseLabels: Readonly<Record<TransferLocale, string>> = { bs: 'Skladište', en: 'Warehouse' };

export function warehouseParty(label: string | null | undefined, configured: string, locale: TransferLocale): TransferParty {
  const name = label?.trim() || configured.trim() || defaultWarehouseLabels[locale];
  return { userId: null, name, title: '', unit: '', email: '' };
}

export function transferDocumentData(snapshot: TransferSnapshot): TransferDocumentData {
  const issued = new Date(snapshot.issuedAt);
  const localeTag = snapshot.locale === 'bs' ? 'bs-BA' : 'en-GB';
  const date = new Intl.DateTimeFormat(localeTag, { timeZone: snapshot.timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(issued);
  const time = new Intl.DateTimeFormat(localeTag, { timeZone: snapshot.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(issued);
  const items: TransferItemData[] = snapshot.items.map((item, index) => ({
    rb: String(index + 1),
    naziv: item.name,
    inventarni_broj: item.assetTag,
    serijski_broj: item.serialNumber,
    tip: item.type,
    proizvodjac: item.manufacturer,
    model: item.model,
    lokacija: item.location,
    napomena_stavke: item.note,
  }));
  return {
    broj: snapshot.number,
    datum: date,
    vrijeme: time,
    mjesto: snapshot.place,
    scenarij: transferScenarioLabels[snapshot.scenario][snapshot.locale],
    jeZaduzenje: snapshot.scenario === 'WAREHOUSE_TO_USER',
    jePrezaduzenje: snapshot.scenario === 'USER_TO_USER',
    jeRazduzenje: snapshot.scenario === 'USER_TO_WAREHOUSE',
    predaje_ime: snapshot.from.name,
    predaje_funkcija: snapshot.from.title,
    predaje_oj: snapshot.from.unit,
    predaje_email: snapshot.from.email,
    preuzima_ime: snapshot.to.name,
    preuzima_funkcija: snapshot.to.title,
    preuzima_oj: snapshot.to.unit,
    preuzima_email: snapshot.to.email,
    potpisnik_ime: snapshot.signatory.name,
    potpisnik_funkcija: snapshot.signatory.title,
    stavke: items,
    broj_stavki: String(items.length),
    napomena: snapshot.note,
    izdao_ime: snapshot.issuedBy.name,
  };
}

/** Sample data for the template "test document". */
export function sampleTransferSnapshot(locale: TransferLocale, timeZone: string): TransferSnapshot {
  const person = (name: string, unit: string, email: string, title = ''): TransferParty => ({ userId: null, name, title, unit, email });
  return {
    version: 1,
    locale,
    number: '09-0007-2026',
    scenario: 'WAREHOUSE_TO_USER',
    issuedAt: new Date().toISOString(),
    timeZone,
    place: locale === 'bs' ? 'Mjesto' : 'City',
    from: warehouseParty(null, '', locale),
    to: person('Amra Hodžić', locale === 'bs' ? 'Služba za IT' : 'IT department', 'amra.h@example.com'),
    signatory: person('Edin Primjer', locale === 'bs' ? 'Direkcija' : 'Head office', 'edin@example.com', locale === 'bs' ? 'Rukovodilac' : 'Head'),
    issuedBy: person('Admin Primjer', '', 'admin@example.com'),
    note: locale === 'bs' ? 'Probni dokument' : 'Test document',
    items: [
      { assetId: 'a1', name: 'Laptop Dell Latitude 5440', assetTag: 'INV-2026-00001', serialNumber: 'SN-001', type: 'Laptop', manufacturer: 'Dell', model: 'Latitude 5440', location: '', note: '' },
      { assetId: 'a2', name: 'Monitor 24"', assetTag: 'INV-2026-00002', serialNumber: 'SN-002', type: 'Monitor', manufacturer: 'Dell', model: 'P2423', location: '', note: '' },
    ],
  };
}

/** Anonymization (2.6): replaces a person everywhere in a snapshot. */
export function scrubSnapshotParty(snapshot: TransferSnapshot, userId: string, pseudonym: string): TransferSnapshot | null {
  let changed = false;
  const scrub = (party: TransferParty): TransferParty => {
    if (party.userId !== userId) return party;
    changed = true;
    return { userId: party.userId, name: pseudonym, title: '', unit: '', email: '' };
  };
  const next = { ...snapshot, from: scrub(snapshot.from), to: scrub(snapshot.to), signatory: scrub(snapshot.signatory), issuedBy: scrub(snapshot.issuedBy) };
  return changed ? next : null;
}
