import { DocsAccessService } from './docs-access.service';
import type { DocsPageRecord } from './docs.types';

const page = (slug: string, roles: string[]): DocsPageRecord => ({
  slug,
  title: slug,
  module: '—',
  part: 'administrator',
  audience: [],
  roles,
  order: 10,
  tags: [],
  updatedAt: null,
  headings: [],
  wordCount: 0,
  source: `docs/user-guide/${slug}.md`,
});

describe('DocsAccessService (Faza 3, korak b)', () => {
  const access = new DocsAccessService();

  it('roles: [] znači svaki prijavljeni korisnik', () => {
    expect(access.canRead(page('tiketi', []), [])).toBe(true);
    expect(access.canRead(page('tiketi', []), ['USER'])).toBe(true);
  });

  it('stranica sa rolama traži poklapanje role iz sesije', () => {
    const instalacija = page('instalacija', ['ADMIN', 'SUPER_ADMIN']);
    expect(access.canRead(instalacija, ['USER', 'AGENT'])).toBe(false);
    expect(access.canRead(instalacija, ['ADMIN'])).toBe(true);
    expect(access.canRead(page('problemi', ['AGENT', 'PROBLEM_MANAGER']), ['PROBLEM_MANAGER'])).toBe(true);
  });

  it('filtriranje liste čuva redoslijed i izbacuje nedozvoljene', () => {
    const pages = [
      page('pocetak-rad', []),
      page('instalacija', ['ADMIN', 'SUPER_ADMIN']),
      page('tiketi', []),
    ];
    expect(access.visiblePages(pages, ['USER']).map((entry) => entry.slug)).toEqual([
      'pocetak-rad',
      'tiketi',
    ]);
    expect(access.visiblePages(pages, ['ADMIN']).map((entry) => entry.slug)).toEqual([
      'pocetak-rad',
      'instalacija',
      'tiketi',
    ]);
  });
});
