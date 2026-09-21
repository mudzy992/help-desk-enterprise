/** Query-string booleans: only `true` / `'true'` are true, anything else false. */
export function toQueryBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

/** `status=A&status=B` and `status=A,B` both become `['A', 'B']`. */
export function toQueryList(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return (Array.isArray(value) ? value : [value])
    .flatMap((item: unknown) =>
      typeof item === 'string' ? item.split(',') : [item],
    )
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : item))
    .filter((item: unknown) => item !== '');
}
