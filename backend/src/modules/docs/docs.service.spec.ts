import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DocsAccessService } from './docs-access.service';
import { docsErrorCodes } from './docs.constants';
import { DocsContentRepository } from './docs-content.repository';
import { DocsError } from './docs.error';
import { DocsService } from './docs.service';
import type { DocsManifest, DocsPageRecord } from './docs.types';

const roots: string[] = [];

const page = (
  slug: string,
  part: string,
  order: number,
  roles: string[],
  title: string,
): DocsPageRecord => ({
  slug,
  title,
  module: '—',
  part,
  audience: [],
  roles,
  order,
  tags: [],
  updatedAt: '2026-10-03',
  headings: [{ level: 2, text: 'Kako doći', id: 'kako-doci' }],
  wordCount: 10,
  source: `docs/user-guide/${slug}.md`,
  englishTitle: null,
});

function buildService(): DocsService {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-service-'));
  roots.push(root);
  const pages: { record: DocsPageRecord; body: string }[] = [
    {
      record: page('pocetak-rad', 'pocetak', 5, [], 'Početak rada'),
      body: '# Početak rada\n\nuvodni tekst za sve korisnike.\n',
    },
    {
      record: page('instalacija', 'pocetak', 10, ['ADMIN', 'SUPER_ADMIN'], 'Instalacija'),
      body: '# Instalacija\n\nprvi start i superadmin nalog.\n',
    },
    {
      record: page('tiketi', 'korisnik', 10, [], 'Tiketi'),
      body: '# Tiketi\n\ntiket prati zahtjev korisnika.\n',
    },
    {
      record: {
        ...page('cesta-pitanja', 'korisnik', 30, [], 'Česta pitanja'),
        englishTitle: 'Frequently asked questions',
      },
      body: '# Česta pitanja\n\nkratka pitanja i odgovori.\n',
    },
    {
      record: page('uloge-i-permisije', 'korisnik', 20, ['ADMIN', 'SUPER_ADMIN'], 'Uloge i permisije'),
      body: '# Uloge i permisije\n\npermisije i role mijenja administrator.\n',
    },
  ];
  mkdirSync(path.join(root, 'en'), { recursive: true });
  writeFileSync(
    path.join(root, 'en', 'cesta-pitanja.md'),
    '# Frequently asked questions\n\nshort questions and answers.\n',
    'utf8',
  );
  const manifest: DocsManifest = {
    parts: [
      { key: 'pocetak', order: 1, pages: ['pocetak-rad', 'instalacija'] },
      { key: 'korisnik', order: 2, pages: ['tiketi', 'uloge-i-permisije', 'cesta-pitanja'] },
    ],
    pages: pages.map((entry) => entry.record),
  };
  writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  for (const entry of pages) {
    writeFileSync(path.join(root, `${entry.record.slug}.md`), entry.body, 'utf8');
  }
  const repository = new DocsContentRepository(root);
  repository.onModuleInit();
  return new DocsService(repository, new DocsAccessService());
}

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('DocsService (Faza 3, korak b)', () => {
  const docs = buildService();

  it('navigacija prikazuje samo vidljive stranice, po dijelovima i redu', () => {
    const user = docs.navigation(['USER']);
    expect(user.parts.map((part) => part.key)).toEqual(['pocetak', 'korisnik']);
    expect(user.parts[0]).toMatchObject({ key: 'pocetak', label: 'Početak' });
    expect(user.parts[0].pages.map((entry) => entry.slug)).toEqual(['pocetak-rad']);
    expect(user.parts[1].pages.map((entry) => entry.slug)).toEqual([
      'tiketi',
      'cesta-pitanja',
    ]);

    const admin = docs.navigation(['ADMIN']);
    expect(admin.parts[0].pages.map((entry) => entry.slug)).toEqual(['pocetak-rad', 'instalacija']);
    expect(admin.parts[1].pages.map((entry) => entry.slug)).toEqual([
      'tiketi',
      'uloge-i-permisije',
      'cesta-pitanja',
    ]);
    expect(admin.parts[0].pages[0].updatedAt).toBe('2026-10-03');
  });

  it('stranica nosi TOC, prethodnu/sljedeću iz vidljivog susjedstva', () => {
    const forAdmin = docs.readPage('pocetak-rad', ['ADMIN']);
    expect(forAdmin.toc).toEqual([{ level: 2, text: 'Kako doći', id: 'kako-doci' }]);
    expect(forAdmin.previous).toBeNull();
    expect(forAdmin.next).toEqual({ slug: 'instalacija', title: 'Instalacija' });

    const user = docs.readPage('pocetak-rad', ['USER']);
    expect(user.next).toBeNull();
    expect(user.roles).toEqual([]);
  });

  it('na `en` vraća prevod i engleski naslov, a stranicu bez prevoda ostavlja bosansku (val 5)', () => {
    const translated = docs.readPage('cesta-pitanja', ['USER'], 'en');
    expect(translated.locale).toBe('en');
    expect(translated.translated).toBe(true);
    expect(translated.markdown).toContain('short questions and answers');
    expect(translated.title).toBe('Frequently asked questions');

    const fallback = docs.readPage('tiketi', ['USER'], 'en');
    expect(fallback.locale).toBe('bs');
    expect(fallback.translated).toBe(false);
    expect(fallback.markdown).toContain('tiket prati zahtjev');
    expect(fallback.title).toBe('Tiketi');

    // Bosanski ostaje bosanski i kad prevod postoji.
    const bosnian = docs.readPage('cesta-pitanja', ['USER']);
    expect(bosnian.locale).toBe('bs');
    expect(bosnian.title).toBe('Česta pitanja');
  });

  it('navigacija na `en` miješa engleske naslove prevedenih i bosanske ostalih (val 5)', () => {
    const english = docs.navigation(['USER'], 'en');
    const titles = english.parts.flatMap((part) =>
      part.pages.map((entry) => `${entry.slug}:${entry.title}`),
    );
    expect(titles).toContain('cesta-pitanja:Frequently asked questions');
    expect(titles).toContain('tiketi:Tiketi');

    const bosnian = docs.navigation(['USER']);
    expect(
      bosnian.parts.flatMap((part) => part.pages.map((entry) => entry.title)),
    ).toContain('Česta pitanja');
  });

  it('nepoznat i nedozvoljen slug daju istu grešku (404), a nesiguran slug svoju', () => {
    expect(codes(() => docs.readPage('nepoznato', ['ADMIN']))).toContain(docsErrorCodes.pageNotFound);
    expect(codes(() => docs.readPage('instalacija', ['USER']))).toContain(docsErrorCodes.pageNotFound);
    expect(codes(() => docs.readPage('../etc/passwd', ['ADMIN']))).toContain(
      docsErrorCodes.invalidSlug,
    );
    expect(codes(() => docs.readPage('Velika-Slova', ['ADMIN']))).toContain(
      docsErrorCodes.invalidSlug,
    );
  });

  it('pretraga poštuje role i odbija prekratak upit', () => {
    const asUser = docs.search('permisije', 20, ['USER']);
    expect(asUser.results.map((entry) => entry.slug)).toEqual([]);

    const asAdmin = docs.search('permisije', 20, ['ADMIN']);
    expect(asAdmin.results.map((entry) => entry.slug)).toEqual(['uloge-i-permisije']);
    expect(asAdmin.results[0].excerptParts.some((part) => part.match)).toBe(true);

    expect(codes(() => docs.search('a', 20, ['ADMIN']))).toContain(docsErrorCodes.queryTooShort);
    // `limit: 0` nije greška — koristi se podrazumijevani limit.
    const clamped = docs.search('tiket', 0, ['USER']);
    expect(clamped.results.map((entry) => entry.slug)).toEqual(['tiketi']);
  });

  it('bez ogledala sve rute vraćaju DOCS_CONTENT_UNAVAILABLE', () => {
    const empty = new DocsService(
      new DocsContentRepository(path.join(tmpdir(), 'docs-empty-root')),
      new DocsAccessService(),
    );
    expect(codes(() => empty.navigation(['ADMIN']))).toContain(docsErrorCodes.contentUnavailable);
    expect(codes(() => empty.search('tiket', 20, ['ADMIN']))).toContain(
      docsErrorCodes.contentUnavailable,
    );
  });
});

function codes(operation: () => unknown): string[] {
  try {
    operation();
  } catch (error) {
    if (error instanceof DocsError) {
      return [error.code];
    }
    throw error;
  }
  return [];
}
