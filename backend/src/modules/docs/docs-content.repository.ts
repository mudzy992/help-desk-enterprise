import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { docsContentRootEnvKey, docsErrorCodes, docsLimits } from './docs.constants';
import { DocsError } from './docs.error';
import type {
  DocsExcerptPart,
  DocsManifest,
  DocsPageContent,
  DocsPageRecord,
  DocsSearchMatch,
} from './docs.types';

/** Putanja do generisanog ogledala; testovi je zadaju eksplicitno. */
export const DOCS_CONTENT_ROOT = 'DOCS_CONTENT_ROOT';

/**
 * Docs modul (Faza 3, korak b): čita generisano ogledalo sadržaja.
 *
 * Sadržaj se učitava **jednom, pri startu procesa** (`OnModuleInit`) i drži u
 * memoriji (`Map<slug, page>`, tokeni za pretragu). Baza se ne dira nijednim
 * zahtjevom. Ako ogledalo nedostaje ili je neispravno, aplikacija se **ne
 * ruši**: greška se zaloguje, a endpointi vraćaju 503 `DOCS_CONTENT_UNAVAILABLE`.
 */
@Injectable()
export class DocsContentRepository implements OnModuleInit {
  private readonly logger = new Logger(DocsContentRepository.name);
  private manifest: DocsManifest | null = null;
  private readonly documents = new Map<string, string>();
  private readonly tokensBySlug = new Map<string, Map<string, number>>();

  constructor(
    @Optional() @Inject(DOCS_CONTENT_ROOT) private readonly contentRoot?: string,
  ) {}

  onModuleInit(): void {
    try {
      this.load();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Docs sadržaj nije učitan (${reason}); /docs rute vraćaju 503.`);
    }
  }

  listPages(): readonly DocsPageRecord[] {
    this.ensureLoaded();
    return this.manifest?.pages ?? [];
  }

  readPage(slug: string): DocsPageContent | null {
    this.ensureLoaded();
    const page = this.manifest?.pages.find((entry) => entry.slug === slug);
    if (page === undefined) {
      return null;
    }
    const markdown = this.documents.get(slug);
    if (markdown === undefined) {
      return null;
    }
    return { page, markdown };
  }

  /**
   * Pretraga po naslovu, tagovima i tekstu. Vraća sve pogotke (filtriranje po
   * rolama radi `DocsService`), sortirane po rangu: naslov > tagovi > tekst.
   * Isječak se vraća kao dijelovi (`excerptParts`) — server nikad ne šalje HTML.
   */
  search(query: string, limit: number): readonly DocsSearchMatch[] {
    this.ensureLoaded();
    const needles = tokenize(query);
    if (needles.length === 0 || this.manifest === null) {
      return [];
    }
    const matches: DocsSearchMatch[] = [];
    for (const page of this.manifest.pages) {
      const titleTokens = tokenize(page.title);
      const tagTokens = new Set(page.tags.flatMap((tag) => tokenize(tag)));
      const bodyTokens = this.tokensBySlug.get(page.slug) ?? new Map<string, number>();
      let score = 0;
      let hits = 0;
      for (const needle of needles) {
        const inTitle = titleTokens.some((token) => token.startsWith(needle));
        const inTags = [...tagTokens].some((token) => token.startsWith(needle));
        const inBody = countPrefix(bodyTokens, needle);
        if (!inTitle && !inTags && inBody === 0) {
          continue;
        }
        hits += 1;
        score += (inTitle ? 100 : 0) + (inTags ? 40 : 0) + Math.min(inBody, 10);
      }
      if (hits === 0) {
        continue;
      }
      // Svi pojmovi iz upita moraju se pojaviti negdje; djelimično poklapanje rangira niže.
      const exactBonus = hits === needles.length ? 25 : 0;
      matches.push({
        slug: page.slug,
        title: page.title,
        part: page.part,
        module: page.module,
        excerptParts: this.excerptPartsFor(page.slug, needles),
        matches: hits,
        score: score + exactBonus,
      });
    }
    return matches
      .sort((a, b) => (b.score === a.score ? a.title.localeCompare(b.title) : b.score - a.score))
      .slice(0, limit);
  }

  private excerptPartsFor(slug: string, needles: readonly string[]): readonly DocsExcerptPart[] {
    const markdown = this.documents.get(slug) ?? '';
    const plain = markdown
      .replace(/^---[\s\S]*?---/, '')
      .replace(/[`*_>#|[\]()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normalized = normalizeText(plain);
    let position = -1;
    for (const needle of needles) {
      const found = normalized.indexOf(needle);
      if (found !== -1 && (position === -1 || found < position)) {
        position = found;
      }
    }
    const start = position === -1 ? 0 : Math.max(0, position - 60);
    const end = Math.min(plain.length, start + docsLimits.excerptLength);
    const window = plain.slice(start, end).trim();
    const prefix = start > 0 ? '… ' : '';
    const suffix = end < plain.length ? ' …' : '';
    return buildExcerptParts(`${prefix}${window}${suffix}`, needles);
  }

  private load(): void {
    const root = this.resolveContentRoot();
    const manifestPath = path.join(root, 'manifest.json');
    let manifest: DocsManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DocsManifest;
    } catch {
      throw new DocsError(docsErrorCodes.contentUnavailable);
    }
    if (!Array.isArray(manifest.pages)) {
      throw new DocsError(docsErrorCodes.contentUnavailable);
    }
    this.manifest = manifest;
    for (const page of manifest.pages) {
      let body: string;
      try {
        body = readFileSync(path.join(root, `${page.slug}.md`), 'utf8');
      } catch {
        continue;
      }
      this.documents.set(page.slug, body);
      this.tokensBySlug.set(page.slug, tokenCounts(body));
    }
  }

  private ensureLoaded(): void {
    if (this.manifest === null) {
      throw new DocsError(docsErrorCodes.contentUnavailable);
    }
  }

  private resolveContentRoot(): string {
    const candidates = [
      this.contentRoot,
      process.env[docsContentRootEnvKey],
      // Iz builda: dist/src/modules/docs → /usr/app/content/docs.
      path.resolve(__dirname, '..', '..', '..', '..', 'content', 'docs'),
      // Iz ts-jest-a: src/modules/docs → backend/content/docs.
      path.resolve(__dirname, '..', '..', '..', 'content', 'docs'),
      path.resolve(process.cwd(), 'backend', 'content', 'docs'),
      path.resolve(process.cwd(), 'content', 'docs'),
    ];
    for (const candidate of candidates) {
      if (candidate !== undefined && existsSync(path.join(candidate, 'manifest.json'))) {
        return candidate;
      }
    }
    throw new DocsError(docsErrorCodes.contentUnavailable);
  }
}

/** Skida dijakritiku i mala slova — isti oblik kao slugifikacija naslova. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (letter) => (letter === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/**
 * Dijeli isječak na dijelove: server šalje **podatke** (`match: true/false`), a
 * klijent sam gradi `<mark>` element (§7.3).
 */
export function buildExcerptParts(
  excerpt: string,
  needles: readonly string[],
): readonly DocsExcerptPart[] {
  const normalized = normalizeText(excerpt);
  const ranges: { start: number; end: number }[] = [];
  for (const needle of needles) {
    let from = 0;
    for (;;) {
      const found = normalized.indexOf(needle, from);
      if (found === -1) {
        break;
      }
      ranges.push({ start: found, end: found + needle.length });
      from = found + needle.length;
    }
  }
  if (ranges.length === 0) {
    return [{ text: excerpt, match: false }];
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  const parts: DocsExcerptPart[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      parts.push({ text: excerpt.slice(cursor, range.start), match: false });
    }
    parts.push({ text: excerpt.slice(range.start, range.end), match: true });
    cursor = range.end;
  }
  if (cursor < excerpt.length) {
    parts.push({ text: excerpt.slice(cursor), match: false });
  }
  return parts;
}

/**
 * Broj pojava tokena koji **počinju** upitom. Tako `permisije` nalazi i
 * `permisija` (dijakritika je već svedena u `tokenize`), bez stemminga (§7.3).
 */
function countPrefix(counts: Map<string, number>, needle: string): number {
  let total = 0;
  for (const [token, count] of counts) {
    if (token.startsWith(needle)) {
      total += count;
    }
  }
  return total;
}

function tokenCounts(markdown: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokenize(markdown)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}
