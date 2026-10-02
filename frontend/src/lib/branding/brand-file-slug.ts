/** Paket 4.1: file-name prefix from the configured product name ("Service Desk" → "service-desk"). */
export function brandFileSlug(appName: string): string {
  const slug = appName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "service-desk";
}
