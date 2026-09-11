export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): {
  readonly pageItems: readonly T[];
  readonly totalPages: number;
  readonly page: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    page: safePage,
  };
}
