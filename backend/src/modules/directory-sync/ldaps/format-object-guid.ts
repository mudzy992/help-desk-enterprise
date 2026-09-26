/**
 * AD stores objectGUID as 16 bytes; the first three groups are little-endian.
 * Result is the canonical lowercase form (e.g. used by Get-ADUser).
 */
export function formatObjectGuid(value: Buffer | string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const bytes = typeof value === 'string' ? Buffer.from(value, 'binary') : value;
  if (bytes.length !== 16) {
    return null;
  }
  const hex = (start: number, end: number, reverse: boolean): string => {
    const slice = [...bytes.subarray(start, end)];
    return (reverse ? slice.reverse() : slice)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  };
  return [
    hex(0, 4, true),
    hex(4, 6, true),
    hex(6, 8, true),
    hex(8, 10, false),
    hex(10, 16, false),
  ].join('-');
}
