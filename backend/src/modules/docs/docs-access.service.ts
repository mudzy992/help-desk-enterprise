import { Injectable } from '@nestjs/common';
import type { DocsPageRecord } from './docs.types';

/**
 * Docs modul (Faza 3, korak b): provjera uloge **na serveru** (odluka D3).
 *
 * Pravila iz `docs/DOCS_MODULE.md` §3.2 i §6:
 * - `roles: []` znači „svaki prijavljeni korisnik“,
 * - inače stranicu vidi samo nosilac jedne od navedenih rola iz frontmattera
 *   (`SUPER_ADMIN` je naveden tamo gdje stranica treba superadmina),
 * - nedozvoljena stranica se ponaša kao **nepoznata** (404, ne 403) da se ne
 *   otkriva postojanje internih stranica.
 */
@Injectable()
export class DocsAccessService {
  canRead(page: DocsPageRecord, roleKeys: readonly string[]): boolean {
    if (page.roles.length === 0) {
      return true;
    }
    return page.roles.some((role) => roleKeys.includes(role));
  }

  visiblePages(
    pages: readonly DocsPageRecord[],
    roleKeys: readonly string[],
  ): readonly DocsPageRecord[] {
    return pages.filter((page) => this.canRead(page, roleKeys));
  }
}
