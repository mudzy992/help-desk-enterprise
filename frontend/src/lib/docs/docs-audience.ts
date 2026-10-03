/**
 * Faza 3 (c): filter po publici u Dokumentaciji.
 *
 * Server već šalje samo stranice koje korisnik smije otvoriti; ovaj filter je
 * **prikaz** („pokaži mi samo korisničke stranice“), ne sigurnosna mjera.
 * Stranica sa `roles: []` dostupna je svima i vidi se u svakom filteru.
 */
export const docsAudiences = ["all", "user", "agent", "admin"] as const;

export type DocsAudience = (typeof docsAudiences)[number];

export const docsAudienceLabelKeys = {
  all: "docs.audience.all",
  user: "docs.audience.user",
  agent: "docs.audience.agent",
  admin: "docs.audience.admin",
} as const satisfies Readonly<Record<DocsAudience, string>>;

const audienceRoles: Readonly<Record<Exclude<DocsAudience, "all">, readonly string[]>> = {
  user: ["USER"],
  agent: ["AGENT", "ASSET_MANAGER", "PROBLEM_MANAGER", "CHANGE_MANAGER"],
  admin: ["ADMIN", "SUPER_ADMIN"],
};

export function matchesDocsAudience(
  page: { readonly roles: readonly string[] },
  audience: DocsAudience,
): boolean {
  if (audience === "all") {
    return true;
  }
  if (page.roles.length === 0) {
    return true;
  }
  const roles = audienceRoles[audience];
  return page.roles.some((role) => roles.includes(role));
}

export function filterDocsByAudience<T extends { readonly roles: readonly string[] }>(
  pages: readonly T[],
  audience: DocsAudience,
): readonly T[] {
  return pages.filter((page) => matchesDocsAudience(page, audience));
}
