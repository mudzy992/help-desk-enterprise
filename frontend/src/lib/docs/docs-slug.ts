/**
 * Faza 3 (d): kontekstualna „?“ pomoć — mapiranje ruta ekrana na stranice
 * dokumentacije. Svaki `slug` mora postojati u `manifest.json`;
 * `scripts/check-docs-content.mjs` to i provjerava.
 */
export type DocsTarget = {
  readonly slug: string;
  readonly anchor?: string;
};

const docsSlugByRoute: ReadonlyArray<{ readonly prefix: string; readonly target: DocsTarget }> = [
  { prefix: "/tickets", target: { slug: "tiketi" } },
  { prefix: "/services", target: { slug: "katalog-usluga-i-forme" } },
  { prefix: "/status", target: { slug: "status-incidenti-i-planirani-prekidi" } },
  { prefix: "/announcements", target: { slug: "najave" } },
  { prefix: "/on-call", target: { slug: "dezurstva" } },
  { prefix: "/my-assets", target: { slug: "imovina" } },
  { prefix: "/assets", target: { slug: "imovina" } },
  { prefix: "/problems", target: { slug: "problemi" } },
  { prefix: "/changes", target: { slug: "promjene" } },
  { prefix: "/knowledge-base", target: { slug: "baza-znanja" } },
  { prefix: "/account/security", target: { slug: "prijava-i-mfa" } },
  { prefix: "/account/notifications", target: { slug: "prijava-i-mfa" } },
  { prefix: "/appearance", target: { slug: "precice-i-pristupacnost" } },
  { prefix: "/users", target: { slug: "korisnici-oj-i-grupe" } },
  { prefix: "/admin/organizational-units", target: { slug: "korisnici-oj-i-grupe" } },
  { prefix: "/routing", target: { slug: "usmjeravanje-i-prioritet" } },
  { prefix: "/sla", target: { slug: "sla" } },
  { prefix: "/admin/email-templates", target: { slug: "posta" } },
  { prefix: "/admin/templates", target: { slug: "sabloni-i-playbooks" } },
  { prefix: "/reports", target: { slug: "nadzorna-ploca-i-izvjestaji" } },
];

/** Vraća stranicu dokumentacije za rutu, ili `null` kad pomoći nema. */
export function docsTargetForPath(pathname: string): DocsTarget | null {
  const match = docsSlugByRoute.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );
  return match?.target ?? null;
}

export function docsHref(target: DocsTarget): string {
  return target.anchor === undefined
    ? `/docs/${target.slug}`
    : `/docs/${target.slug}#${target.anchor}`;
}
