import type { AssetAttributeDataTypeValue } from './assets.constants';

export type AssetAttributeDefinition = {
  readonly key: string;
  readonly dataType: AssetAttributeDataTypeValue;
  readonly options: unknown;
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly archivedAt: Date | null;
};

export type AttributeValue = string | number | boolean;

export type AttributeIssue = {
  readonly key: string;
  /** required | number | date | boolean | option | text_too_long | unknown */
  readonly problem: 'required' | 'number' | 'date' | 'boolean' | 'option' | 'text_too_long' | 'unknown';
};

export const attributeTextMax = 500;

export function selectOptionsOf(definition: Pick<AssetAttributeDefinition, 'options'>): string[] {
  return Array.isArray(definition.options)
    ? definition.options.filter((option): option is string => typeof option === 'string')
    : [];
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses one raw value (from the form or an import cell) into the stored
 * shape. `undefined` result = empty. Throws nothing; returns an issue instead.
 */
export function parseAttributeValue(
  definition: AssetAttributeDefinition,
  raw: unknown,
): { readonly value: AttributeValue | undefined } | { readonly issue: AttributeIssue['problem'] } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: undefined };
  }
  switch (definition.dataType) {
    case 'NUMBER': {
      const number = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
      return Number.isFinite(number) ? { value: number } : { issue: 'number' };
    }
    case 'BOOLEAN': {
      if (typeof raw === 'boolean') return { value: raw };
      const text = String(raw).trim().toLowerCase();
      if (['true', 'da', 'yes', '1', 'x'].includes(text)) return { value: true };
      if (['false', 'ne', 'no', '0'].includes(text)) return { value: false };
      return { issue: 'boolean' };
    }
    case 'DATE': {
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) return { value: raw.toISOString().slice(0, 10) };
      const text = String(raw).trim();
      const european = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(text);
      const normalized = european
        ? `${european[3]}-${european[2].padStart(2, '0')}-${european[1].padStart(2, '0')}`
        : text.slice(0, 10);
      if (!isoDate.test(normalized)) return { issue: 'date' };
      const date = new Date(`${normalized}T00:00:00Z`);
      return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
        ? { issue: 'date' }
        : { value: normalized };
    }
    case 'SELECT': {
      const text = String(raw).trim();
      const match = selectOptionsOf(definition).find((option) => option.toLowerCase() === text.toLowerCase());
      return match === undefined ? { issue: 'option' } : { value: match };
    }
    default: {
      const text = String(raw).trim();
      return text.length > attributeTextMax ? { issue: 'text_too_long' } : { value: text };
    }
  }
}

/**
 * §4: validates a full or partial attribute map against the type definition.
 * - unknown keys are rejected (archived keys are kept as they were);
 * - partial: only the given keys are checked, `required` only when given empty;
 * - the result is the merged map to store.
 */
export function validateAssetAttributes(input: {
  readonly definitions: readonly AssetAttributeDefinition[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly current?: Readonly<Record<string, unknown>>;
  readonly partial?: boolean;
}): { readonly attributes: Record<string, AttributeValue>; readonly issues: AttributeIssue[] } {
  const byKey = new Map(input.definitions.map((definition) => [definition.key, definition]));
  const issues: AttributeIssue[] = [];
  const merged: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(input.current ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') merged[key] = value;
  }
  for (const [key, raw] of Object.entries(input.values)) {
    const definition = byKey.get(key);
    if (definition === undefined || definition.archivedAt !== null) {
      issues.push({ key, problem: 'unknown' });
      continue;
    }
    const parsed = parseAttributeValue(definition, raw);
    if ('issue' in parsed) {
      issues.push({ key, problem: parsed.issue });
      continue;
    }
    if (parsed.value === undefined) delete merged[key];
    else merged[key] = parsed.value;
  }
  for (const definition of input.definitions) {
    if (!definition.isRequired || definition.archivedAt !== null) continue;
    const given = Object.prototype.hasOwnProperty.call(input.values, definition.key);
    if (input.partial === true && !given) continue;
    if (merged[definition.key] === undefined && !issues.some((issue) => issue.key === definition.key)) {
      issues.push({ key: definition.key, problem: 'required' });
    }
  }
  return { attributes: merged, issues };
}
