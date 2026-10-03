/** Tipovi Docs modula (Faza 3, korak b) — ogledalo manifesta iz `scripts/generate-docs-content.mjs`. */

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
};

export type DocsManifest = {
  readonly parts: readonly { readonly key: string; readonly order: number; readonly pages: readonly string[] }[];
  readonly pages: readonly DocsPageRecord[];
};

export type DocsPageContent = {
  readonly page: DocsPageRecord;
  readonly markdown: string;
};

export type DocsNavigationItem = {
  readonly slug: string;
  readonly title: string;
  readonly module: string;
  readonly order: number;
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
  readonly excerptParts: readonly DocsExcerptPart[];
  readonly matches: number;
  readonly score: number;
};

export type DocsSearchResponse = {
  readonly query: string;
  readonly total: number;
  readonly results: readonly DocsSearchMatch[];
};
