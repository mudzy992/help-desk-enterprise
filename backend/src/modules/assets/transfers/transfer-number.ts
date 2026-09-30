/**
 * Paket 3.2 (§7a.3): transfer numbers. The counter is per month (reset on the
 * 1st, installation time zone) and independent of the format; the format only
 * decides how year, month, day and the counter are printed.
 *
 * Tokens: {DD} (optional), {MM}, {YYYY}, {N…} with 3-6 N (zero-padded counter).
 * {MM}, {YYYY} and one {N…} are required exactly once so a number is unique.
 */
export const defaultTransferNumberFormat = '{MM}-{NNNN}-{YYYY}';

const tokenPattern = /\{(DD|MM|YYYY|N{3,6})\}/g;
const allowedLiteral = /^[\p{L}\p{N} ._/-]*$/u;

export type TransferNumberFormatProblem = 'too_long' | 'missing_month' | 'missing_year' | 'missing_counter' | 'duplicate_token' | 'invalid_characters';

export function validateTransferNumberFormat(format: unknown): TransferNumberFormatProblem | null {
  if (typeof format !== 'string' || format.length === 0 || format.length > 40) return 'too_long';
  const tokens = [...format.matchAll(tokenPattern)].map((match) => (match[1].startsWith('N') ? 'N' : match[1]));
  const literal = format.replace(tokenPattern, '');
  if (literal.includes('{') || literal.includes('}') || !allowedLiteral.test(literal)) return 'invalid_characters';
  if (new Set(tokens).size !== tokens.length) return 'duplicate_token';
  if (!tokens.includes('MM')) return 'missing_month';
  if (!tokens.includes('YYYY')) return 'missing_year';
  if (!tokens.includes('N')) return 'missing_counter';
  return null;
}

export type TransferNumberParts = { readonly year: number; readonly month: number; readonly day: number; readonly sequence: number };

export function formatTransferNumber(format: string, parts: TransferNumberParts): string {
  const effective = validateTransferNumberFormat(format) === null ? format : defaultTransferNumberFormat;
  return effective.replace(tokenPattern, (_, token: string) => {
    if (token === 'DD') return String(parts.day).padStart(2, '0');
    if (token === 'MM') return String(parts.month).padStart(2, '0');
    if (token === 'YYYY') return String(parts.year);
    return String(parts.sequence).padStart(token.length, '0');
  });
}

/** Calendar parts of `date` in `timeZone` (the month the counter belongs to). */
export function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}
