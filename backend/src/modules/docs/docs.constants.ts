/**
 * Docs modul (Faza 3, korak b): kodovi grešaka, limiti i dijelovi wikija.
 *
 * Sadržaj se ne drži u kodu — čita se iz generisanog ogledala
 * (`backend/content/docs`, vidi `scripts/generate-docs-content.mjs`), pa ovaj
 * fajl nosi samo pravila pristupa i pretrage.
 */
export const docsErrorCodes = {
  contentUnavailable: 'DOCS_CONTENT_UNAVAILABLE',
  pageNotFound: 'DOCS_PAGE_NOT_FOUND',
  queryTooShort: 'DOCS_QUERY_TOO_SHORT',
  invalidSlug: 'DOCS_INVALID_SLUG',
} as const;

export type DocsErrorCode = (typeof docsErrorCodes)[keyof typeof docsErrorCodes];

/** Putanja do generisanog ogledala; u kontejneru `/usr/app/content/docs`. */
export const docsContentRootEnvKey = 'DOCS_CONTENT_ROOT';

export const docsLimits = {
  /** Slugovi su `[a-z0-9-]`; duže od ovoga ne postoji ni u jednom frontmatteru. */
  slugMaxLength: 80,
  /** Kraći upit vraća previše rezultata i besmislen je. */
  queryMinLength: 2,
  queryMaxLength: 100,
  searchDefaultLimit: 20,
  searchMaxLimit: 50,
  /** Dužina isječka u rezultatu pretrage. */
  excerptLength: 200,
} as const;

/**
 * Dijelovi wikija iz `docs/user-guide/TEZE-ZA-DOKUMENTACIJU.md` §3. Redoslijed
 * je redoslijed prikaza u lijevom navu; `operativa` trenutno nema stranica
 * (dolaze iz `docs/ops/**`, koje nije izvor ovog modula).
 */
export const docsPartLabels: Readonly<Record<string, string>> = {
  pocetak: 'Početak',
  korisnik: 'Korisnik',
  agent: 'Agent',
  administrator: 'Administrator',
  operativa: 'Operativa',
  referenca: 'Referenca',
};

export const docsSlugPattern = new RegExp(`^[a-z0-9-]{1,${docsLimits.slugMaxLength}}$`);

/** Vraća `true` ako je slug bezbjedan za pretragu (bez `..`, `/`, velikih slova). */
export function isSafeDocsSlug(value: string): boolean {
  return docsSlugPattern.test(value);
}
