import type { JsonValue } from './change-log.types';

export function flattenJsonPaths(
  value: JsonValue,
  prefix = '',
): Map<string, JsonValue> {
  const paths = new Map<string, JsonValue>();
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        mergePaths(paths, flattenJsonPaths(entry, joinPath(prefix, String(index))));
      });
      return paths;
    }
    const record = value as { readonly [key: string]: JsonValue };
    for (const key of Object.keys(record).sort((left, right) =>
      left.localeCompare(right),
    )) {
      mergePaths(
        paths,
        flattenJsonPaths(record[key], joinPath(prefix, key)),
      );
    }
    return paths;
  }
  if (prefix.length > 0) {
    paths.set(prefix, value);
  }
  return paths;
}

function joinPath(prefix: string, segment: string): string {
  return prefix.length === 0 ? segment : `${prefix}.${segment}`;
}

function mergePaths(
  target: Map<string, JsonValue>,
  source: Map<string, JsonValue>,
): void {
  for (const [path, value] of source) {
    target.set(path, value);
  }
}
