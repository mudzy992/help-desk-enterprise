import { apiRequest } from "@/services/api";

/**
 * Faza 3 (c): `/docs/*`. Types mirror `backend/src/modules/docs`.
 *
 * Server filtrira po ulozi pozivaoca — klijent prikazuje samo ono što dobije,
 * pa filter po publici u UI-u ne može otkriti skrivene stranice.
 */

export type DocsHeading = {
  readonly level: number;
  readonly text: string;
  readonly id: string;
};

/** Jezik sadržaja: `en` vraća prevod kad postoji, inače bosanski uz `translated: false`. */
export type DocsLocale = "bs" | "en";

export type DocsNavigationItem = {
  readonly slug: string;
  readonly title: string;
  readonly module: string;
  readonly order: number;
  /** Role iz frontmattera; `[]` znači „svi prijavljeni“ (filter po publici). */
  readonly roles: readonly string[];
  readonly updatedAt: string | null;
};

export type DocsNavigationPart = {
  readonly key: string;
  readonly label: string;
  readonly pages: readonly DocsNavigationItem[];
};

export type DocsNavigation = {
  readonly parts: readonly DocsNavigationPart[];
};

export type DocsPageLink = {
  readonly slug: string;
  readonly title: string;
};

export type DocsPage = {
  readonly slug: string;
  readonly title: string;
  readonly module: string;
  readonly part: string;
  readonly audience: readonly string[];
  readonly roles: readonly string[];
  readonly tags: readonly string[];
  readonly updatedAt: string | null;
  readonly markdown: string;
  readonly toc: readonly DocsHeading[];
  readonly previous: DocsPageLink | null;
  readonly next: DocsPageLink | null;
  /** Jezik vraćenog teksta (traženi `en` bez prevoda pada na `bs`). */
  readonly locale: DocsLocale;
  readonly translated: boolean;
};

export type DocsExcerptPart = {
  readonly text: string;
  readonly match: boolean;
};

export type DocsSearchResult = {
  readonly slug: string;
  readonly title: string;
  readonly part: string;
  readonly module: string;
  readonly roles: readonly string[];
  readonly excerptParts: readonly DocsExcerptPart[];
  readonly matches: number;
  readonly score: number;
};

export type DocsSearchResponse = {
  readonly query: string;
  readonly total: number;
  readonly results: readonly DocsSearchResult[];
};

export function getDocsNavigation(locale: DocsLocale = "bs"): Promise<DocsNavigation> {
  return apiRequest<DocsNavigation>(`/docs/navigation?locale=${locale}`);
}

export function getDocsPage(slug: string, locale: DocsLocale = "bs"): Promise<DocsPage> {
  return apiRequest<DocsPage>(`/docs/pages/${encodeURIComponent(slug)}?locale=${locale}`);
}

export function searchDocs(query: string, limit?: number): Promise<DocsSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }
  return apiRequest<DocsSearchResponse>(`/docs/search?${params.toString()}`);
}
