import { SlaError } from './sla.error';

const keyPattern = /^[A-Z][A-Z0-9_]{0,63}$/;

export function normalizeSlaKey(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!keyPattern.test(normalized)) {
    throw new SlaError('INVALID_KEY');
  }
  return normalized;
}

export function normalizeSlaName(value: string, maximumLength: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new SlaError('INVALID_NAME');
  }
  return normalized;
}

export function normalizeOptionalDescription(
  value: string | null | undefined,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > maximumLength) {
    throw new SlaError('INVALID_NAME');
  }
  return normalized;
}
