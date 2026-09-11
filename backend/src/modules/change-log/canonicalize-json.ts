import type { JsonValue } from './change-log.types';

export function canonicalizeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  const record = value as { readonly [key: string]: JsonValue };
  return Object.fromEntries(
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, canonicalizeJson(record[key])]),
  );
}
