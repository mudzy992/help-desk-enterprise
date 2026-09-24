export const searchTypes = ['ticket', 'article', 'user'] as const;

export const searchConstants = {
  /** Hits per group. The plan (§1.2) asks for ≤ 15 per type. */
  defaultLimit: 15,
  /** Hard ceiling of the `limit` query parameter. */
  maxLimit: 25,
  /** One letter would match most of the table; the UI waits for two too. */
  minimumQueryLength: 2,
  maximumQueryLength: 200,
  /**
   * Candidate rows read per group before the visibility filter runs: a candidate
   * may be dropped (confidential ticket, article of another scope), so a few
   * extra rows are read to still fill the group.
   */
  candidateMultiplier: 3,
} as const;
