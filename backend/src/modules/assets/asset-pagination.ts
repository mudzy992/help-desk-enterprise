import { assetLimits } from './assets.constants';

export type AssetPageQuery = {
  readonly cursor?: string;
  readonly limit?: number;
};

export type AssetPageMetadata = {
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type AssetCursorPage<T> = AssetPageMetadata & {
  readonly items: readonly T[];
};

export function assetPageLimit(
  requested: number | undefined,
  fallback: number = assetLimits.listPageDefault,
  maximum: number = assetLimits.listPageMax,
): number {
  return Math.min(Math.max(requested ?? fallback, 1), maximum);
}

export function toAssetCursorPage<T>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => string,
): AssetCursorPage<T> {
  const items = rows.slice(0, limit);
  return {
    items,
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit && items.length > 0 ? cursorOf(items[items.length - 1]!) : null,
  };
}
