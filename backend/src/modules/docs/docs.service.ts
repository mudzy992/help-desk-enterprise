import { Injectable } from '@nestjs/common';
import { DocsAccessService } from './docs-access.service';
import { DocsContentRepository } from './docs-content.repository';
import { docsErrorCodes, docsLimits, docsPartLabels, isSafeDocsSlug } from './docs.constants';
import { DocsError } from './docs.error';
import type {
  DocsNavigation,
  DocsPageContent,
  DocsPageLink,
  DocsPageRecord,
  DocsPageResponse,
  DocsSearchResponse,
} from './docs.types';

/**
 * Docs modul (Faza 3, korak b): navigacija, stranica i pretraga nad
 * generisanim ogledalom. Sve što korisnik vidi prolazi kroz
 * `DocsAccessService` — filtriranje je serversko, UI ga samo prikazuje.
 */
@Injectable()
export class DocsService {
  constructor(
    private readonly repository: DocsContentRepository,
    private readonly access: DocsAccessService,
  ) {}

  navigation(roleKeys: readonly string[]): DocsNavigation {
    const visible = this.access.visiblePages(this.repository.listPages(), roleKeys);
    const parts = new Map<string, DocsPageRecord[]>();
    for (const page of visible) {
      const bucket = parts.get(page.part) ?? [];
      bucket.push(page);
      parts.set(page.part, bucket);
    }
    return {
      parts: [...parts.entries()]
        .sort((a, b) => partOrder(a[0]) - partOrder(b[0]))
        .map(([key, pages]) => ({
          key,
          label: docsPartLabels[key] ?? key,
          pages: pages
            .sort((a, b) => (a.order === b.order ? a.title.localeCompare(b.title) : a.order - b.order))
            .map((page) => ({
              slug: page.slug,
              title: page.title,
              module: page.module,
              order: page.order,
              updatedAt: page.updatedAt,
            })),
        })),
    };
  }

  readPage(slug: string, roleKeys: readonly string[]): DocsPageResponse {
    const content = this.loadPage(slug, roleKeys);
    const visible = this.access.visiblePages(this.repository.listPages(), roleKeys);
    const siblings = visible
      .filter((page) => page.part === content.page.part)
      .sort((a, b) => (a.order === b.order ? a.title.localeCompare(b.title) : a.order - b.order));
    const index = siblings.findIndex((page) => page.slug === content.page.slug);
    return {
      slug: content.page.slug,
      title: content.page.title,
      module: content.page.module,
      part: content.page.part,
      audience: content.page.audience,
      roles: content.page.roles,
      tags: content.page.tags,
      updatedAt: content.page.updatedAt,
      markdown: content.markdown,
      toc: content.page.headings,
      previous: index > 0 ? linkOf(siblings[index - 1]) : null,
      next: index >= 0 && index < siblings.length - 1 ? linkOf(siblings[index + 1]) : null,
    };
  }

  search(query: string, limit: number, roleKeys: readonly string[]): DocsSearchResponse {
    const trimmed = query.trim();
    if (trimmed.length < docsLimits.queryMinLength) {
      throw new DocsError(docsErrorCodes.queryTooShort);
    }
    const effective = trimmed.slice(0, docsLimits.queryMaxLength);
    const boundedLimit = Math.max(
      1,
      Math.min(limit > 0 ? limit : docsLimits.searchDefaultLimit, docsLimits.searchMaxLimit),
    );
    const allowed = new Set(
      this.access.visiblePages(this.repository.listPages(), roleKeys).map((page) => page.slug),
    );
    const matches = this.repository
      .search(effective, this.repository.listPages().length)
      .filter((match) => allowed.has(match.slug))
      .slice(0, boundedLimit);
    return { query: effective, total: matches.length, results: matches };
  }

  private loadPage(slug: string, roleKeys: readonly string[]): DocsPageContent {
    // Slugs come from the URL: validate before any lookup, so `..` or a path
    // can never reach the filesystem layer (which reads only from the manifest,
    // but the check keeps the error taxonomy honest).
    if (!isSafeDocsSlug(slug)) {
      throw new DocsError(docsErrorCodes.invalidSlug);
    }
    const content = this.repository.readPage(slug);
    if (content === null || !this.access.canRead(content.page, roleKeys)) {
      throw new DocsError(docsErrorCodes.pageNotFound);
    }
    return content;
  }
}

function linkOf(page: DocsPageRecord): DocsPageLink {
  return { slug: page.slug, title: page.title };
}

function partOrder(key: string): number {
  const order = ['pocetak', 'korisnik', 'agent', 'administrator', 'operativa', 'referenca'];
  const index = order.indexOf(key);
  return index === -1 ? order.length : index;
}

