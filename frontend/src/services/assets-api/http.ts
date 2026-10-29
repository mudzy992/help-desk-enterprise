export const jsonBody = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
export const assetPath = (id: string): string => `/assets/${encodeURIComponent(id)}`;

export function buildCommercialListQuery(
  filters: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}
