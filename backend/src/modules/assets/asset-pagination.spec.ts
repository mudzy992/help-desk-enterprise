import { assetPageLimit, toAssetCursorPage } from './asset-pagination';

describe('asset cursor pagination', () => {
  it('uses the configured default and clamps requested page sizes', () => {
    expect(assetPageLimit(undefined)).toBe(50);
    expect(assetPageLimit(0)).toBe(1);
    expect(assetPageLimit(250)).toBe(100);
    expect(assetPageLimit(250, 25, 80)).toBe(80);
  });

  it('returns a stable cursor from the last included row only when another row exists', () => {
    const first = toAssetCursorPage([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2, (row) => row.id);
    expect(first).toEqual({ items: [{ id: 'a' }, { id: 'b' }], hasMore: true, nextCursor: 'b' });

    const last = toAssetCursorPage([{ id: 'c' }], 2, (row) => row.id);
    expect(last).toEqual({ items: [{ id: 'c' }], hasMore: false, nextCursor: null });
  });
});
