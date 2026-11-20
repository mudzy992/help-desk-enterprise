import { Prisma } from '../../../generated/prisma/client';
import { mentionTokens } from './mention-tokens';
import type { ScrubIdentifiers } from './text-scrubber';

/**
 * BA-changes-17: *which* changes can contain a person's data.
 *
 * The anonymisation used to select changes by relationship only - requester or
 * owner - so a change whose plan named somebody else (a colleague in the
 * implementation plan, a manager in the test plan) was never selected and the
 * scrubber never ran on it. The selection is now the scrubbable text itself, the
 * same rule the problems follow since W7.34: every token the scrubber would
 * replace is also a candidate filter, and the database match is a deliberate
 * superset (substring in SQL, word boundaries in the scrubber). Extra rows are
 * harmless - the scrub is idempotent and a change with no replacement is
 * skipped.
 *
 * `outcome` is an enum and `title` is bounded to 200 characters, so the search
 * covers the nine free-text columns and the event JSON detail.
 */
export const changeScrubbableColumns = [
  'title',
  'description',
  'reason',
  'implementationPlan',
  'backoutPlan',
  'testPlan',
  'communicationPlan',
  'reviewNotes',
  'cancelReason',
] as const;

export function changeMentionTokens(identifiers: ScrubIdentifiers): readonly string[] {
  return mentionTokens(identifiers);
}

/** Any scrubbable column mentioning any token (case-insensitive). */
export function changeMentionWhere(tokens: readonly string[]): Prisma.ChangeRequestWhereInput {
  if (tokens.length === 0) return { id: { in: [] } };
  return {
    OR: changeScrubbableColumns.flatMap((column) =>
      tokens.map((token) => ({ [column]: { contains: token, mode: 'insensitive' as const } })),
    ),
  } as Prisma.ChangeRequestWhereInput;
}

/**
 * Events whose JSON detail mentions a token. Prisma cannot filter inside a Json
 * column by text, so this is one bounded raw query for the whole run; the token
 * list is short (a name, its reverse, the address, domain logins).
 */
export function changeEventMentionSql(tokens: readonly string[]): Prisma.Sql {
  if (tokens.length === 0) return Prisma.sql`SELECT "id" FROM "ChangeEvent" WHERE false`;
  const matches = tokens.map((token) => Prisma.sql`"detail"::text ILIKE ${`%${token}%`}`);
  return Prisma.sql`
    SELECT "id" FROM "ChangeEvent"
    WHERE "detail" IS NOT NULL AND (${Prisma.join(matches, ' OR ')})
  `;
}

/**
 * Calendar windows that copied a change (`number · title`) and mention a token.
 * The window is written by the downtime sync, so scrubbing only the change would
 * leave the person's name in the service calendar.
 */
export function downtimeWindowMentionWhere(tokens: readonly string[]): Prisma.ServiceDowntimeWindowWhereInput {
  if (tokens.length === 0) return { id: { in: [] } };
  return {
    OR: tokens.map((token) => ({ message: { contains: token, mode: 'insensitive' as const } })),
  } as Prisma.ServiceDowntimeWindowWhereInput;
}
