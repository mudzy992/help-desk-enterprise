import { parseAttributeValue, type AssetAttributeDefinition, type AttributeValue } from '../asset-attributes';
import { canTransitionAssetStatus, type AssetStatusValue } from '../assets.constants';
import {
  attributeColumnPrefix,
  clearMarkers,
  normalizeHeader,
  parseStatusCell,
  type AssetColumnKey,
  type AssetFixedColumnKey,
} from './asset-import-columns';

/**
 * Paket 3.2 (§11): turns parsed rows into a plan (create / update / unchanged
 * / skip) plus row errors. Pure: every lookup is prepared by the service in a
 * handful of bulk queries, so 5 000 rows cost the same number of queries as 5.
 */

export type ImportMode = 'CREATE_ONLY' | 'UPSERT';

export type ImportUnit = { readonly id: string; readonly name: string; readonly ouPath: string; readonly distinguishedName: string; readonly inScope: boolean };
export type ImportUser = { readonly id: string; readonly email: string; readonly isActive: boolean };
export type ImportLocation = { readonly id: string; readonly name: string; readonly code: string | null; readonly path: string };
export type ImportService = { readonly id: string; readonly name: string; readonly slug: string };

export type ImportAssetState = {
  readonly assetTag: string | null;
  readonly name: string;
  readonly status: AssetStatusValue;
  readonly serialNumber: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly organizationalUnitId: string;
  readonly assignedUserId: string | null;
  readonly locationId: string | null;
  readonly serviceId: string | null;
  readonly purchaseDate: string | null;
  readonly purchaseCost: string | null;
  readonly supplier: string | null;
  readonly warrantyEndsAt: string | null;
  readonly notes: string | null;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
};

export type ExistingAsset = ImportAssetState & {
  readonly id: string;
  readonly assetTag: string;
  readonly typeId: string;
  readonly version: number;
  readonly source: 'MANUAL' | 'IMPORT' | 'DIRECTORY';
  readonly inScope: boolean;
};

export type ImportContext = {
  readonly typeId: string;
  readonly typeKey: string;
  readonly mode: ImportMode;
  readonly autoTag: boolean;
  readonly definitions: readonly AssetAttributeDefinition[];
  readonly units: readonly ImportUnit[];
  /** Users referenced in the file (by e-mail or login), prefetched. */
  readonly users: readonly ImportUser[];
  readonly locations: readonly ImportLocation[];
  readonly services: readonly ImportService[];
  /** Existing assets matched by tag (any type) or serial (this type). */
  readonly existingByTag: ReadonlyMap<string, ExistingAsset>;
  readonly existingBySerial: ReadonlyMap<string, ExistingAsset>;
  /** Unique attribute values already stored: key → lower(value) → asset id. */
  readonly uniqueValues: ReadonlyMap<string, ReadonlyMap<string, string>>;
};

export type ImportRowError = {
  readonly row: number;
  readonly column: AssetColumnKey | null;
  readonly code: string;
  readonly value?: string;
};

export type PlannedRow = {
  readonly row: number;
  readonly action: 'create' | 'update';
  readonly assetId: string | null;
  readonly version: number | null;
  readonly data: ImportAssetState;
  readonly changes: readonly string[];
};

export type ImportTotals = {
  readonly total: number;
  readonly create: number;
  readonly update: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly errors: number;
};

export type ImportPlan = {
  readonly planned: PlannedRow[];
  readonly errors: ImportRowError[];
  /** Sheet row numbers with at least one error (for the error workbook). */
  readonly errorRows: number[];
  readonly totals: ImportTotals;
};

const textLimits: Partial<Record<AssetFixedColumnKey, number>> = {
  assetTag: 64,
  name: 160,
  serialNumber: 120,
  manufacturer: 120,
  model: 120,
  supplier: 160,
  notes: 4000,
};
const creatableStatuses: readonly AssetStatusValue[] = ['ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR'];
const tagPattern = /^[\p{L}\p{N}._/-]+$/u;

type Cell = { readonly kind: 'absent' } | { readonly kind: 'keep' } | { readonly kind: 'clear' } | { readonly kind: 'value'; readonly text: string };

function readCell(values: ReadonlyMap<AssetColumnKey, string>, key: AssetColumnKey): Cell {
  if (!values.has(key)) return { kind: 'absent' };
  const text = (values.get(key) ?? '').trim();
  if (text === '') return { kind: 'keep' };
  if ((clearMarkers as readonly string[]).includes(text.toLowerCase())) return { kind: 'clear' };
  return { kind: 'value', text };
}

/** 2026-10-01, 1.10.2026, 01.10.2026. → ISO date, or null when not a real date. */
export function parseImportDate(text: string): string | null {
  const european = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(text);
  const iso = european ? `${european[3]}-${european[2].padStart(2, '0')}-${european[1].padStart(2, '0')}` : text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** 1234.5 / 1234,50 / 1.234,50 / 1,234.50 → "1234.50"; null when not money. */
export function parseImportMoney(text: string): string | null {
  let normalized = text.replace(/\s|KM|BAM|EUR|€/gi, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) normalized = normalized.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)) normalized = normalized.replace(/,/g, '');
  else normalized = normalized.replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized).toFixed(2);
}

function uniqueMatch<T>(items: readonly T[]): { readonly item: T } | { readonly problem: 'not_found' | 'ambiguous' } {
  if (items.length === 1) return { item: items[0] };
  return { problem: items.length === 0 ? 'not_found' : 'ambiguous' };
}

export function matchUnit(units: readonly ImportUnit[], text: string) {
  const lower = text.toLowerCase();
  const exact = units.filter((unit) => unit.ouPath.toLowerCase() === lower || unit.distinguishedName.toLowerCase() === lower);
  if (exact.length > 0) return uniqueMatch(exact);
  return uniqueMatch(units.filter((unit) => unit.name.toLowerCase() === lower));
}

export function matchUser(users: readonly ImportUser[], text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('@')) return uniqueMatch(users.filter((user) => user.email.toLowerCase() === lower));
  return uniqueMatch(users.filter((user) => user.email.toLowerCase().split('@')[0] === lower));
}

export function matchLocation(locations: readonly ImportLocation[], text: string) {
  const lower = text.toLowerCase();
  const byCode = locations.filter((location) => location.code !== null && location.code.toLowerCase() === lower);
  if (byCode.length > 0) return uniqueMatch(byCode);
  const normalizedPath = normalizeHeader(text.replace(/[›>/\\]/g, ' '));
  const byPath = locations.filter((location) => normalizeHeader(location.path.replace(/[›>/\\]/g, ' ')) === normalizedPath);
  if (byPath.length > 0) return uniqueMatch(byPath);
  return uniqueMatch(locations.filter((location) => location.name.toLowerCase() === lower));
}

export function matchService(services: readonly ImportService[], text: string) {
  const lower = text.toLowerCase();
  const bySlug = services.filter((service) => service.slug.toLowerCase() === lower);
  if (bySlug.length > 0) return uniqueMatch(bySlug);
  return uniqueMatch(services.filter((service) => service.name.toLowerCase() === lower));
}

const emptyState = (organizationalUnitId: string): ImportAssetState => ({
  assetTag: null,
  name: '',
  status: 'IN_STOCK',
  serialNumber: null,
  manufacturer: null,
  model: null,
  organizationalUnitId,
  assignedUserId: null,
  locationId: null,
  serviceId: null,
  purchaseDate: null,
  purchaseCost: null,
  supplier: null,
  warrantyEndsAt: null,
  notes: null,
  attributes: {},
});

function sameValue(left: unknown, right: unknown): boolean {
  return (left ?? null) === (right ?? null) || JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function planAssetImport(input: {
  readonly mapping: readonly (AssetColumnKey | null)[];
  readonly rows: readonly (readonly string[])[];
  readonly rowNumbers: readonly number[];
  readonly context: ImportContext;
}): ImportPlan {
  const { context } = input;
  const planned: PlannedRow[] = [];
  const errors: ImportRowError[] = [];
  const errorRows = new Set<number>();
  let unchanged = 0;
  let skipped = 0;
  const seenTags = new Map<string, number>();
  const seenSerials = new Map<string, number>();
  const seenUnique = new Map<string, Map<string, number>>();
  const definitionByKey = new Map(context.definitions.filter((definition) => definition.archivedAt === null).map((definition) => [definition.key, definition]));

  input.rows.forEach((cells, index) => {
    const row = input.rowNumbers[index] ?? index + 2;
    const values = new Map<AssetColumnKey, string>();
    input.mapping.forEach((key, column) => {
      if (key !== null) values.set(key, cells[column] ?? '');
    });
    const rowErrors: ImportRowError[] = [];
    const fail = (column: AssetColumnKey | null, code: string, value?: string) => rowErrors.push({ row, column, code, ...(value === undefined ? {} : { value: value.slice(0, 120) }) });

    // --- type column (present in exports) must match the chosen type.
    const typeCell = readCell(values, 'type');
    if (typeCell.kind === 'value' && typeCell.text.toLowerCase() !== context.typeKey.toLowerCase()) fail('type', 'type_mismatch', typeCell.text);

    // --- match an existing asset.
    const tagCell = readCell(values, 'assetTag');
    const serialCell = readCell(values, 'serialNumber');
    const tag = tagCell.kind === 'value' ? tagCell.text : null;
    if (tag !== null) {
      if (tag.length > 64 || !tagPattern.test(tag)) fail('assetTag', 'tag_invalid', tag);
      const previous = seenTags.get(tag.toLowerCase());
      if (previous !== undefined) fail('assetTag', 'duplicate_in_file', String(previous));
      else seenTags.set(tag.toLowerCase(), row);
    }
    const serial = serialCell.kind === 'value' ? serialCell.text : null;
    if (serial !== null) {
      const previous = seenSerials.get(serial.toLowerCase());
      if (previous !== undefined && tag === null) fail('serialNumber', 'duplicate_in_file', String(previous));
      else seenSerials.set(serial.toLowerCase(), row);
    }
    const existing =
      tag !== null ? (context.existingByTag.get(tag.toLowerCase()) ?? null) : serial !== null ? (context.existingBySerial.get(serial.toLowerCase()) ?? null) : null;

    if (existing !== null) {
      if (context.mode === 'CREATE_ONLY') {
        if (rowErrors.length > 0) {
          errors.push(...rowErrors);
          errorRows.add(row);
        } else skipped += 1;
        return;
      }
      if (existing.typeId !== context.typeId) fail('assetTag', 'type_mismatch', existing.assetTag);
      if (!existing.inScope) fail('assetTag', 'asset_out_of_scope', existing.assetTag);
      if (existing.status === 'DISPOSED') fail('assetTag', 'read_only', existing.assetTag);
    } else if (tag === null && !context.autoTag) {
      fail('assetTag', 'tag_required');
    }

    const base: ImportAssetState = existing ?? emptyState('');
    const attributes: Record<string, AttributeValue> = { ...base.attributes };
    const next: { -readonly [K in keyof ImportAssetState]: ImportAssetState[K] } = { ...base, attributes };
    if (existing === null) next.assetTag = tag;

    // --- plain text fields.
    for (const key of ['name', 'serialNumber', 'manufacturer', 'model', 'supplier', 'notes'] as const) {
      const cell = readCell(values, key);
      if (cell.kind === 'clear') {
        if (key === 'name') fail(key, 'cannot_clear');
        else next[key] = null;
      } else if (cell.kind === 'value') {
        if (cell.text.length > (textLimits[key] ?? 500)) fail(key, 'too_long');
        else if (key === 'name') {
          if (existing?.source === 'DIRECTORY' && cell.text !== existing.name) fail(key, 'directory_owned');
          else next.name = cell.text;
        } else if (key === 'serialNumber' && existing?.serialNumber?.toLowerCase() === cell.text.toLowerCase()) {
          // Matched case-insensitively: a case-only difference is not a change.
        } else next[key] = cell.text;
      }
    }
    if (next.name.trim() === '') fail('name', 'required');

    // --- dates and money.
    for (const key of ['purchaseDate', 'warrantyEndsAt'] as const) {
      const cell = readCell(values, key);
      if (cell.kind === 'clear') next[key] = null;
      else if (cell.kind === 'value') {
        const date = parseImportDate(cell.text);
        if (date === null) fail(key, 'invalid_date', cell.text);
        else next[key] = date;
      }
    }
    const costCell = readCell(values, 'purchaseCost');
    if (costCell.kind === 'clear') next.purchaseCost = null;
    else if (costCell.kind === 'value') {
      const money = parseImportMoney(costCell.text);
      if (money === null) fail('purchaseCost', 'invalid_number', costCell.text);
      else next.purchaseCost = money;
    }

    // --- references.
    const unitCell = readCell(values, 'organizationalUnit');
    if (unitCell.kind === 'clear') fail('organizationalUnit', 'cannot_clear');
    else if (unitCell.kind === 'value') {
      const match = matchUnit(context.units, unitCell.text);
      if ('problem' in match) fail('organizationalUnit', `unit_${match.problem}`, unitCell.text);
      else if (!match.item.inScope) fail('organizationalUnit', 'unit_out_of_scope', unitCell.text);
      else next.organizationalUnitId = match.item.id;
    }
    if (next.organizationalUnitId === '') fail('organizationalUnit', 'required');

    const userCell = readCell(values, 'assignedUser');
    if (userCell.kind === 'clear') next.assignedUserId = null;
    else if (userCell.kind === 'value') {
      const match = matchUser(context.users, userCell.text);
      if ('problem' in match) fail('assignedUser', `user_${match.problem}`, userCell.text);
      else if (!match.item.isActive) fail('assignedUser', 'user_inactive', userCell.text);
      else next.assignedUserId = match.item.id;
    }

    const locationCell = readCell(values, 'location');
    if (locationCell.kind === 'clear') next.locationId = null;
    else if (locationCell.kind === 'value') {
      const match = matchLocation(context.locations, locationCell.text);
      if ('problem' in match) fail('location', `location_${match.problem}`, locationCell.text);
      else next.locationId = match.item.id;
    }

    const serviceCell = readCell(values, 'service');
    if (serviceCell.kind === 'clear') next.serviceId = null;
    else if (serviceCell.kind === 'value') {
      const match = matchService(context.services, serviceCell.text);
      if ('problem' in match) fail('service', `service_${match.problem}`, serviceCell.text);
      else next.serviceId = match.item.id;
    }

    // --- status (§5 rules; import never retires or disposes).
    const statusCell = readCell(values, 'status');
    if (statusCell.kind === 'clear') fail('status', 'cannot_clear');
    else if (statusCell.kind === 'value') {
      const status = parseStatusCell(statusCell.text);
      if (status === null) fail('status', 'invalid_status', statusCell.text);
      else if (!creatableStatuses.includes(status)) fail('status', 'status_not_allowed', statusCell.text);
      else if (existing !== null && !canTransitionAssetStatus(existing.status, status)) fail('status', 'status_transition', statusCell.text);
      else next.status = status;
    } else {
      // No status in the row: follow the assignment (§7: assigned = in use).
      if (next.assignedUserId !== null && next.status !== 'IN_USE' && (existing === null || canTransitionAssetStatus(existing.status, 'IN_USE'))) {
        next.status = 'IN_USE';
      } else if (next.assignedUserId === null && next.status === 'IN_USE' && existing !== null) {
        next.status = 'IN_STOCK';
      }
    }
    const assignmentChanged = existing === null || next.status !== existing.status || next.assignedUserId !== existing.assignedUserId;
    if (assignmentChanged && next.status === 'IN_USE' && next.assignedUserId === null) fail('assignedUser', 'user_required_in_use');
    if (assignmentChanged && next.status !== 'IN_USE' && next.assignedUserId !== null) fail('status', 'assigned_requires_in_use');

    // --- attributes.
    for (const [column, raw] of values) {
      if (!column.startsWith(attributeColumnPrefix)) continue;
      const key = column.slice(attributeColumnPrefix.length);
      const definition = definitionByKey.get(key);
      if (definition === undefined) continue;
      const cell = readCell(values, column);
      if (cell.kind === 'keep' || cell.kind === 'absent') continue;
      if (cell.kind === 'clear') {
        delete attributes[key];
        continue;
      }
      const parsed = parseAttributeValue(definition, raw);
      if ('issue' in parsed) {
        fail(column, `attribute_${parsed.issue}`, cell.text);
        continue;
      }
      if (parsed.value === undefined) continue;
      attributes[key] = parsed.value;
      if (definition.isUnique) {
        const lower = String(parsed.value).toLowerCase();
        const owner = context.uniqueValues.get(key)?.get(lower);
        if (owner !== undefined && owner !== existing?.id) fail(column, 'attribute_not_unique', cell.text);
        const seen = seenUnique.get(key) ?? new Map<string, number>();
        seenUnique.set(key, seen);
        if (seen.has(lower)) fail(column, 'duplicate_in_file', String(seen.get(lower)));
        else seen.set(lower, row);
      }
    }
    for (const definition of definitionByKey.values()) {
      if (definition.isRequired && next.attributes[definition.key] === undefined) {
        fail(`${attributeColumnPrefix}${definition.key}`, 'attribute_required');
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      errorRows.add(row);
      return;
    }
    if (existing === null) {
      planned.push({ row, action: 'create', assetId: null, version: null, data: next, changes: [] });
      return;
    }
    const changes = (Object.keys(next) as (keyof ImportAssetState)[]).filter((key) => !sameValue(next[key], existing[key]));
    if (changes.length === 0) {
      unchanged += 1;
      return;
    }
    planned.push({ row, action: 'update', assetId: existing.id, version: existing.version, data: next, changes });
  });

  const creates = planned.filter((entry) => entry.action === 'create').length;
  return {
    planned,
    errors,
    errorRows: [...errorRows],
    totals: {
      total: input.rows.length,
      create: creates,
      update: planned.length - creates,
      unchanged,
      skipped,
      errors: errorRows.size,
    },
  };
}
