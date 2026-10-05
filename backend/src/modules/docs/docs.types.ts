/** Tipovi Docs modula (Faza 3, korak b) — ogledalo manifesta iz `scripts/generate-docs-content.mjs`. */

/** Jezik sadržaja; `en` vraća prevod kad postoji, inače bosanski uz `translated: false`. */
export type DocsLocale = 'bs' | 'en';

export const docsLocales = ['bs', 'en'] as const satisfies readonly DocsLocale[];

export type DocsHeading = {
  readonly level: number;
  readonly text: string;
  readonly id: string;
};

export type DocsPageRecord = {
  readonly slug: string;
  readonly title: string;
  readonly module: string;
  readonly part: string;
  readonly audience: readonly string[];
  readonly roles: readonly string[];
  readonly order: number;
  readonly tags: readonly string[];
  readonly updatedAt: string | null;
  readonly headings: readonly DocsHeading[];
  readonly wordCount: number;
  readonly source: string;
  /** Naslov prevoda (`docs/user-guide/en/<slug>.md`); `null` kad prevoda nema. */
  readonly englishTitle: string | null;
};

export type DocsManifest = {
  readonly parts: readonly { readonly key: string; readonly order: number; readonly pages: readonly string[] }[];
  readonly pages: readonly DocsPageRecord[];
};

export type DocsPageContent = {
  readonly page: DocsPageRecord;
  readonly markdown: string;
  /** Jezik teksta koji je stvarno vraćen (traženi `en` bez prevoda pada na `bs`). */
  readonly locale: DocsLocale;
  /** `true` samo kad je vraćen engleski tekst. */
  readonly translated: boolean;
};

export type DocsNavigationItem = {
  readonly slug: string;
  readonly title: string;
  readonly module: string;
  readonly order: number;
  /** Role iz frontmattera — klijentski filter po publici (Faza 3, korak (c)). */
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

export type DocsPageResponse = {
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
  readonly locale: DocsLocale;
  readonly translated: boolean;
};

/** Isječak kao podaci: klijent gradi `<mark>` za dijelove sa `match: true`. */
export type DocsExcerptPart = {
  readonly text: string;
  readonly match: boolean;
};

export type DocsSearchMatch = {
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
  readonly results: readonly DocsSearchMatch[];
};
