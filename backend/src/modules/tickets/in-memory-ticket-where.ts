/**
 * Test-support subset of Prisma's `where` / `orderBy` for the in-memory ticket
 * delegate. Deliberately loose: the evaluator throws on operators it does not
 * implement instead of silently matching, so a new query shape fails a test
 * loudly.
 */
export type InMemoryTicketWhere = { readonly [field: string]: unknown };

export type InMemoryTicketOrderBy =
  | { readonly [field: string]: unknown }
  | ReadonlyArray<{ readonly [field: string]: unknown }>;

/** Relation rows by relation name (`participants`, `slaState`, `assignedGroup`, etc.). */
export type InMemoryTicketRelations = Readonly<
  Record<string, (ticket: { readonly id: string }) => readonly object[]>
>;
