export type TicketListPageMetadata = {
  readonly total: number;
  readonly totalIsCapped?: boolean;
  readonly totalsAsOf: number;
  readonly page: number;
  readonly pageSize: number;
};

export type TicketListResponseEnvelope<T> = {
  readonly items: readonly T[];
  readonly total: number;
  readonly totalIsCapped?: boolean;
  readonly totalsAsOf: number;
  readonly page: number;
  readonly pageSize: number;
};

/** Pure public-envelope mapper shared by the loaded ticket responder and contract test. */
export function toTicketListResponseEnvelope<T>(
  page: TicketListPageMetadata,
  items: readonly T[],
): TicketListResponseEnvelope<T> {
  return {
    items,
    total: page.total,
    ...(page.totalIsCapped === true ? { totalIsCapped: true } : {}),
    totalsAsOf: page.totalsAsOf,
    page: page.page,
    pageSize: page.pageSize,
  };
}
