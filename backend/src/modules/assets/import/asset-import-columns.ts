import { assetStatuses, type AssetStatusValue } from '../assets.constants';

/**
 * Paket 3.2 (§11, §13): the spreadsheet columns shared by the template, the
 * export and the import. Export → edit → import (UPSERT) is a supported round
 * trip, so the three must never drift apart; everything reads this file.
 */
export const assetFixedColumnKeys = [
  'assetTag',
  'name',
  'type',
  'status',
  'serialNumber',
  'manufacturer',
  'model',
  'organizationalUnit',
  'assignedUser',
  'location',
  'service',
  'purchaseDate',
  'purchaseCost',
  'supplier',
  'warrantyEndsAt',
  'notes',
] as const;
export type AssetFixedColumnKey = (typeof assetFixedColumnKeys)[number];

/** Attribute columns are `attributes.<key>`. */
export const attributeColumnPrefix = 'attributes.';
export type AssetColumnKey = AssetFixedColumnKey | `attributes.${string}`;

export type ImportLocale = 'bs' | 'en';

export const assetColumnLabels: Readonly<Record<AssetFixedColumnKey, Readonly<Record<ImportLocale, string>>>> = {
  assetTag: { bs: 'Inventarni broj', en: 'Asset tag' },
  name: { bs: 'Naziv', en: 'Name' },
  type: { bs: 'Tip', en: 'Type' },
  status: { bs: 'Status', en: 'Status' },
  serialNumber: { bs: 'Serijski broj', en: 'Serial number' },
  manufacturer: { bs: 'Proizvođač', en: 'Manufacturer' },
  model: { bs: 'Model', en: 'Model' },
  organizationalUnit: { bs: 'Organizaciona jedinica', en: 'Organisational unit' },
  assignedUser: { bs: 'Korisnik (e-mail)', en: 'User (e-mail)' },
  location: { bs: 'Lokacija', en: 'Location' },
  service: { bs: 'Servis', en: 'Service' },
  purchaseDate: { bs: 'Datum nabavke', en: 'Purchase date' },
  purchaseCost: { bs: 'Nabavna cijena', en: 'Purchase cost' },
  supplier: { bs: 'Dobavljač', en: 'Supplier' },
  warrantyEndsAt: { bs: 'Garancija do', en: 'Warranty until' },
  notes: { bs: 'Napomena', en: 'Notes' },
};

export const assetStatusLabels: Readonly<Record<AssetStatusValue, Readonly<Record<ImportLocale, string>>>> = {
  ORDERED: { bs: 'Naručeno', en: 'Ordered' },
  IN_STOCK: { bs: 'Na zalihi', en: 'In stock' },
  IN_USE: { bs: 'U upotrebi', en: 'In use' },
  IN_REPAIR: { bs: 'Na servisu', en: 'In repair' },
  LOST: { bs: 'Izgubljeno', en: 'Lost' },
  RETIRED: { bs: 'Povučeno iz upotrebe', en: 'Retired' },
  DISPOSED: { bs: 'Otpisano', en: 'Disposed' },
};

/** A cell with this marker clears the value in UPSERT (an empty cell means "keep"). */
export const clearMarkers = ['#prazno', '#empty'] as const;

export type ImportAttributeColumn = {
  readonly key: string;
  readonly labelBs: string;
  readonly labelEn: string;
};

/** Comparison form of a header: case, diacritics, spacing and punctuation ignored. */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim();
}

/**
 * Suggests a column key for each header: the technical key, the bs/en label,
 * or an attribute key/label. Unknown headers map to null (ignored unless the
 * user maps them). A key is suggested at most once (the first header wins).
 */
export function suggestColumnMapping(
  headers: readonly string[],
  attributes: readonly ImportAttributeColumn[],
): (AssetColumnKey | null)[] {
  const lookup = new Map<string, AssetColumnKey>();
  for (const key of assetFixedColumnKeys) {
    lookup.set(normalizeHeader(key), key);
    lookup.set(normalizeHeader(assetColumnLabels[key].bs), key);
    lookup.set(normalizeHeader(assetColumnLabels[key].en), key);
  }
  for (const attribute of attributes) {
    const key = `${attributeColumnPrefix}${attribute.key}` as const;
    for (const alias of [key, attribute.key, attribute.labelBs, attribute.labelEn]) {
      const normalized = normalizeHeader(alias);
      if (!lookup.has(normalized)) lookup.set(normalized, key);
    }
  }
  const used = new Set<AssetColumnKey>();
  return headers.map((header) => {
    const key = lookup.get(normalizeHeader(header)) ?? null;
    if (key === null || used.has(key)) return null;
    used.add(key);
    return key;
  });
}

export function isKnownColumnKey(value: string, attributes: readonly ImportAttributeColumn[]): value is AssetColumnKey {
  if ((assetFixedColumnKeys as readonly string[]).includes(value)) return true;
  return value.startsWith(attributeColumnPrefix) && attributes.some((attribute) => `${attributeColumnPrefix}${attribute.key}` === value);
}

export function parseStatusCell(value: string): AssetStatusValue | null {
  const normalized = normalizeHeader(value);
  for (const status of assetStatuses) {
    if (normalizeHeader(status) === normalized || normalized === normalizeHeader(status.replace('_', ' '))) return status;
    if (normalizeHeader(assetStatusLabels[status].bs) === normalized || normalizeHeader(assetStatusLabels[status].en) === normalized) {
      return status;
    }
  }
  return null;
}

/**
 * CSV/Excel formula injection (§11): a cell starting with = + - @ (or a tab /
 * carriage return) is prefixed with an apostrophe on export. Import keeps the
 * text as it is, so a re-imported value only gains the visible apostrophe if
 * someone typed it.
 */
export function escapeSpreadsheetCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
