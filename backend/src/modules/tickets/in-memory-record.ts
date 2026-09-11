export function pickInMemoryRecord<T extends object>(
  record: T | undefined,
  select?: Record<string, boolean>,
): T | Record<string, unknown> | null {
  if (record === undefined) {
    return null;
  }
  if (select === undefined) {
    return record;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = record[key as keyof T];
    }
  }
  return picked;
}

export function matchesNullableField<T>(
  actual: T,
  expected: T | undefined,
): boolean {
  return expected === undefined || actual === expected;
}
