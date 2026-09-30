import { Prisma } from '../../generated/prisma/client';
import { AssetError, assetErrorCodes } from './assets.constants';

export function optionalText(value: string | null | undefined, max: number, field: string): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > max) throw new AssetError(assetErrorCodes.invalid, field);
  return text;
}

export function requiredText(value: string | null | undefined, max: number, field: string): string {
  const text = optionalText(value, max, field);
  if (text === null) throw new AssetError(assetErrorCodes.invalid, field);
  return text;
}

export function optionalDate(value: string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) throw new AssetError(assetErrorCodes.invalid, field);
  return date;
}

export function dateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

export function optionalMoney(value: number | null | undefined, field: string): Prisma.Decimal | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999) throw new AssetError(assetErrorCodes.invalid, field);
  return new Prisma.Decimal(value.toFixed(2));
}

/** Whole days from `now` (UTC midnight) to a date-only value; negative = past. */
export function daysUntil(value: Date, now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}
