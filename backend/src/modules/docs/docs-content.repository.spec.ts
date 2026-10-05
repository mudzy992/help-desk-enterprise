import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { docsErrorCodes } from './docs.constants';
import {
  DocsContentRepository,
  buildExcerptParts,
  tokenize,
} from './docs-content.repository';
import { DocsError } from './docs.error';
import type { DocsManifest, DocsPageRecord } from './docs.types';

const roots: string[] = [];

function page(overrides: Partial<DocsPageRecord> & Pick<DocsPageRecord, 'slug' | 'part'>): DocsPageRecord {
  return {
    title: overrides.slug,
    module: '—',
    audience: [],
    roles: [],
    order: 10,
    tags: [],
    updatedAt: null,
    headings: [],
    wordCount: 0,
    source: `docs/user-guide/${overrides.slug}.md`,
    englishTitle: null,
    ...overrides,
  };
}

function writeFixture(pages: { record: DocsPageRecord; body: string }[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-content-'));
  roots.push(root);
  const manifest: DocsManifest = {
    parts: [...new Set(pages.map((entry) => entry.record.part))].map((key) => ({
      key,
      order: 1,
      pages: pages.filter((entry) => entry.record.part === key).map((entry) => entry.record.slug),
    })),
    pages: pages.map((entry) => entry.record),
  };
  writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  for (const entry of pages) {
    writeFileSync(path.join(root, `${entry.record.slug}.md`), entry.body, 'utf8');
  }
  return root;
}

/** Dodaje prevod (`en/<slug>.md`) u već napisan fixture. */
function writeTranslation(root: string, slug: string, body: string): void {
  mkdirSync(path.join(root, 'en'), { recursive: true });
  writeFileSync(path.join(root, 'en', `${slug}.md`), body, 'utf8');
}

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('DocsContentRepository (Faza 3, korak b)', () => {
  it('učitava manifest i tijelo stranice pri startu', () => {
    const root = writeFixture([
      {
        record: page({ slug: 'tiketi', part: 'korisnik', title: 'Tiketi', tags: ['tiket'] }),
        body: '# Tiketi\n\nTiket opisuje zahtjev korisnika.\n',
      },
    ]);
    const repository = new DocsContentRepository(root);
    repository.onModuleInit();

    expect(repository.listPages().map((entry) => entry.slug)).toEqual(['tiketi']);
    expect(repository.readPage('tiketi')?.markdown).toContain('zahtjev korisnika');
    expect(repository.readPage('nepoznato')).toBeNull();
  });

  it('vraća bosanski tekst i za `en` kad prevoda nema, uz `translated: false` (val 5)', () => {
    const root = writeFixture([
      {
        record: page({ slug: 'tiketi', part: 'korisnik', title: 'Tiketi' }),
        body: '# Tiketi\n\ntiket i zahtjev.\n',
      },
    ]);
    const repository = new DocsContentRepository(root);
    repository.onModuleInit();

    const bosnian = repository.readPage('tiketi');
    expect(bosnian?.locale).toBe('bs');
    expect(bosnian?.translated).toBe(false);

    const fallback = repository.readPage('tiketi', 'en');
    expect(fallback?.markdown).toContain('tiket i zahtjev');
    expect(fallback?.locale).toBe('bs');
    expect(fallback?.translated).toBe(false);
    expect(repository.titleFor(fallback!.page, 'en')).toBe('Tiketi');
  });

  it('vraća prevod kad `en/<slug>.md` postoji, i naslov prevoda za navigaciju (val 5)', () => {
    const root = writeFixture([
      {
        record: page({
          slug: 'tiketi',
          part: 'korisnik',
          title: 'Tiketi',
          englishTitle: 'Tickets',
        }),
        body: '# Tiketi\n\ntiket i zahtjev.\n',
      },
      {
        record: page({ slug: 'cesta-pitanja', part: 'korisnik', title: 'Česta pitanja' }),
        body: '# Česta pitanja\n\nnajčešća pitanja.\n',
      },
    ]);
    writeTranslation(root, 'tiketi', '# Tickets\n\nticket and request.\n');
    const repository = new DocsContentRepository(root);
    repository.onModuleInit();

    const translated = repository.readPage('tiketi', 'en');
    expect(translated?.markdown).toContain('ticket and request');
    expect(translated?.locale).toBe('en');
    expect(translated?.translated).toBe(true);
    expect(repository.titleFor(translated!.page, 'en')).toBe('Tickets');
    expect(repository.titleFor(translated!.page, 'bs')).toBe('Tiketi');

    // Stranica bez prevoda ostaje bosanska i u EN navigaciji zadržava naslov.
    const untranslated = repository.readPage('cesta-pitanja', 'en');
    expect(untranslated?.translated).toBe(false);
    expect(repository.titleFor(untranslated!.page, 'en')).toBe('Česta pitanja');
  });

  it('ne ruši start kad je ogledalo neispravno, a rute vraćaju DOCS_CONTENT_UNAVAILABLE', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'docs-broken-'));
    roots.push(root);
    writeFileSync(path.join(root, 'manifest.json'), '{ ovo nije json', 'utf8');
    const repository = new DocsContentRepository(root);
    expect(() => repository.onModuleInit()).not.toThrow();
    expect(() => repository.readPage('tiketi')).toThrow(DocsError);
    try {
      repository.listPages();
    } catch (error) {
      expect((error as DocsError).code).toBe(docsErrorCodes.contentUnavailable);
    }
  });

  it('bez učitavanja (npr. preskočen OnModuleInit) rute vraćaju DOCS_CONTENT_UNAVAILABLE', () => {
    const repository = new DocsContentRepository(
      path.join(tmpdir(), 'docs-missing-root'),
    );
    expect(() => repository.listPages()).toThrow(DocsError);
  });

  it('rangira pogodak u naslovu iznad pogotka u tekstu i nalazi prefiks', () => {
    const root = writeFixture([
      {
        record: page({ slug: 'a', part: 'korisnik', title: 'Objašnjenje', tags: [] }),
        body: '# Objašnjenje\n\npermisije se dodjeljuju kroz role.\n',
      },
      {
        record: page({ slug: 'b', part: 'korisnik', title: 'Permisije u praksi', tags: [] }),
        body: '# Permisije u praksi\n\nkratak tekst.\n',
      },
      {
        record: page({ slug: 'c', part: 'korisnik', title: 'Nešto drugo', tags: [] }),
        body: '# Nešto drugo\n\nnema tog pojma.\n',
      },
    ]);
    const repository = new DocsContentRepository(root);
    repository.onModuleInit();

    const results = repository.search('permisije', 10);
    expect(results.map((entry) => entry.slug)).toEqual(['b', 'a']);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    // Prefiks: upit `permisij` nalazi i `permisije` i `permisija`.
    expect(repository.search('permisij', 10).map((entry) => entry.slug)).toEqual(['b', 'a']);
    expect(repository.search('nema', 10).map((entry) => entry.slug)).toEqual(['c']);
    expect(repository.search('xx', 10)).toEqual([]);
  });

  it('isječak vraća kao dijelove, sa tačnim rasponima poklapanja', () => {
    const parts = buildExcerptParts('role i permisije se dodjeljuju', ['permisij']);
    expect(parts).toEqual([
      { text: 'role i ', match: false },
      { text: 'permisij', match: true },
      { text: 'e se dodjeljuju', match: false },
    ]);
    expect(buildExcerptParts('bez pogotka', ['xyz'])).toEqual([{ text: 'bez pogotka', match: false }]);
  });

  it('tokenizacija svodi dijakritiku i odbacuje jednoslovne tokene', () => {
    expect(tokenize('Permisije, uloge i dozvole')).toEqual(['permisije', 'uloge', 'dozvole']);
    expect(tokenize('đački čirilica')).toEqual(['dacki', 'cirilica']);
  });
});
