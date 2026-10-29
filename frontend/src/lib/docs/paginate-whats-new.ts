const DEFAULT_PAGE_SIZE = 10;
const TABLE_HEADER_PREFIX = "| Datum |";
const DATED_ROW_PATTERN = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/;

export type PaginatedWhatsNew = {
  readonly markdown: string;
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly firstItem: number;
  readonly lastItem: number;
};

export function paginateWhatsNewMarkdown(
  source: string,
  requestedPage: number,
  pageSize = DEFAULT_PAGE_SIZE,
): PaginatedWhatsNew {
  const lines = source.split("\n");
  const headerIndex = lines.findIndex((line) => line.trimStart().startsWith(TABLE_HEADER_PREFIX));
  const firstRowIndex = headerIndex + 2;
  let lastRowIndex = firstRowIndex;

  while (lastRowIndex < lines.length && DATED_ROW_PATTERN.test(lines[lastRowIndex] ?? "")) {
    lastRowIndex += 1;
  }

  const rows = headerIndex < 0 ? [] : lines.slice(firstRowIndex, lastRowIndex);
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const start = (page - 1) * safePageSize;
  const visibleRows = rows.slice(start, start + safePageSize);
  const markdown =
    headerIndex < 0
      ? source
      : [...lines.slice(0, firstRowIndex), ...visibleRows, ...lines.slice(lastRowIndex)].join("\n");

  return {
    markdown,
    page,
    pageSize: safePageSize,
    totalItems: rows.length,
    totalPages,
    firstItem: rows.length === 0 ? 0 : start + 1,
    lastItem: Math.min(start + visibleRows.length, rows.length),
  };
}
