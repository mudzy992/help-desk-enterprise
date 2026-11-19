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
   * W7.57 (BA-search-03): the former `candidateMultiplier` (3) read
   * `limit × 3` article candidates and filtered them afterwards, which could
   * hide visible hits. Knowledge articles now walk the table in bounded
   * batches (`knowledgeBaseConstants.listScanBatchSize` /
   * `maximumListScanBatches`) and report `articlesIncomplete`, so a plain
   * multiplier no longer exists.
   */
} as const;
