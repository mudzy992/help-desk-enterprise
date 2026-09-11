import { canonicalizeJson } from './canonicalize-json';
import { flattenJsonPaths } from './flatten-json-paths';
import type { ChangeLogDiffEntry, JsonValue } from './change-log.types';

export function buildDeterministicDiff(
  before: JsonValue,
  after: JsonValue,
): readonly ChangeLogDiffEntry[] {
  const beforePaths = flattenJsonPaths(canonicalizeJson(before));
  const afterPaths = flattenJsonPaths(canonicalizeJson(after));
  const paths = [
    ...new Set([...beforePaths.keys(), ...afterPaths.keys()]),
  ].sort((left, right) => left.localeCompare(right));
  return paths.flatMap((path) => {
    const previous = beforePaths.has(path) ? (beforePaths.get(path) as JsonValue) : null;
    const next = afterPaths.has(path) ? (afterPaths.get(path) as JsonValue) : null;
    if (jsonEquals(previous, next)) {
      return [];
    }
    return [{ path, before: previous, after: next }];
  });
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
