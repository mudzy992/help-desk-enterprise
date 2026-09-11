import { buildDeterministicDiff } from './build-deterministic-diff';
import { canonicalizeJson } from './canonicalize-json';

describe('buildDeterministicDiff', () => {
  it('emits a stable, path-sorted diff regardless of object key order', () => {
    const first = buildDeterministicDiff(
      { b: 1, a: { z: true, y: 'old' } },
      { a: { y: 'new', z: true }, b: 1, c: 3 },
    );
    const second = buildDeterministicDiff(
      { a: { y: 'old', z: true }, b: 1 },
      { c: 3, b: 1, a: { z: true, y: 'new' } },
    );
    expect(first).toEqual(second);
    expect(first.map((entry) => entry.path)).toEqual(['a.y', 'c']);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(canonicalizeJson({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  });
});
