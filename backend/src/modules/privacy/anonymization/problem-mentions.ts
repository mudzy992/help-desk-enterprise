import { Prisma } from '../../../generated/prisma/client';
import { nameVariants, type ScrubIdentifiers } from './text-scrubber';

/**
 * W7.34 (BA-problems-16): *which* problems can contain a person's data.
 *
 * The anonymisation used to pick problems by relationship only — creator, owner,
 * or the requester of a linked ticket — so a problem whose free text named
 * somebody else (a manager quoted in the 5-whys, a colleague in the workaround)
 * was never selected and the scrubber never ran on it. The selection is now the
 * scrubbable text itself: every token the scrubber would replace is also a
 * candidate filter, so "the scrubber can change this problem" and "this problem
 * is in scope" are the same set, plus the relationship rows that need no text.
 *
 * The filters are a deliberate **superset** of the scrubber's patterns: a
 * substring match in the database can hit a token inside a longer word, where
 * the scrubber would keep it (word boundaries). The extra rows are harmless —
 * the scrub is idempotent and a problem with zero replacements is skipped.
 */
export const problemScrubbableColumns = [
  'title',
  'description',
  'rootCause',
  'workaround',
  'resolution',
  'cancelReason',
] as const;

/**
 * The strings worth searching for: the same identifiers the scrubber knows, with
 * the same length thresholds, so no replacement can happen outside this set.
 */
export function problemMentionTokens(identifiers: ScrubIdentifiers): readonly string[] {
  const tokens = new Set<string>();
  const email = identifiers.email?.trim();
  if (email !== undefined && email.includes('@')) {
    tokens.add(email);
    const local = email.slice(0, email.indexOf('@'));
    if (local.length >= 5) tokens.add(local);
  }
  const dn = identifiers.distinguishedName?.trim();
  if (dn !== undefined && dn.length > 0) tokens.add(dn);
  for (const login of identifiers.logins ?? []) {
    const value = login?.trim();
    if (value !== undefined && value.length >= 4) tokens.add(value);
  }
  for (const variant of nameVariants(identifiers.displayName ?? '')) tokens.add(variant);
  return [...tokens];
}

/** Any scrubbable column mentioning any token (case-insensitive). */
export function problemMentionWhere(tokens: readonly string[]): Prisma.ProblemWhereInput {
  if (tokens.length === 0) return { id: { in: [] } };
  return {
    OR: problemScrubbableColumns.flatMap((column) =>
      tokens.map((token) => ({ [column]: { contains: token, mode: 'insensitive' as const } })),
    ),
  } as Prisma.ProblemWhereInput;
}

/**
 * Events whose JSON detail mentions a token. Prisma cannot filter inside a Json
 * column by text, so this is one bounded raw query for the whole run; the token
 * list is short (a name, its reverse, the address, domain logins).
 */
export function problemEventMentionSql(tokens: readonly string[]): Prisma.Sql {
  if (tokens.length === 0) return Prisma.sql`SELECT "id" FROM "ProblemEvent" WHERE false`;
  const matches = tokens.map((token) => Prisma.sql`"detail"::text ILIKE ${`%${token}%`}`);
  return Prisma.sql`
    SELECT "id" FROM "ProblemEvent"
    WHERE "detail" IS NOT NULL AND (${Prisma.join(matches, ' OR ')})
  `;
}
