#!/usr/bin/env node
/*
  Docs modul (Faza 3, korak b): validacija sadržaja prije commita i u CI.

  Provjerava sedam stvari iz `docs/DOCS_MODULE.md` §9:
    1. frontmatter (obavezna polja, slug, dio, role, order, naslov = `#` naslov),
    2. sinhronizacija ogledala `backend/content/docs` sa `docs/user-guide/**` (datumi `updatedAt`
       nisu kapija — prijavljuju se kao napomena, vidi `differingUpdatedAt`),
    3. relativne veze unutar `docs/user-guide/**`,
    4. slike (postoje i unutar `docs/user-guide/assets/`),
    5. tajne (obrasci iz §6),
    6. slugovi iz koda (`docsSlug('…')` u frontend/backend izvoru, mapa ekran→stranica
       u `frontend/src/lib/docs/docs-slug.ts` — uključujući anchore),
    7. anchori (`##`/`###` naslovi su jedinstveni unutar stranice).

  Pokretanje: node scripts/check-docs-content.mjs
*/
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDocsContent, isShallowRepository, slugifyHeading } from './generate-docs-content.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'docs', 'user-guide');
const englishSourceDir = path.join(sourceDir, 'en');
const mirrorDir = path.join(repoRoot, 'backend', 'content', 'docs');
const technicalSource = 'TEZE-ZA-DOKUMENTACIJU.md';

const knownParts = new Set(['pocetak', 'korisnik', 'agent', 'administrator', 'operativa', 'referenca']);
const knownRoles = new Set([
  'USER',
  'AGENT',
  'ADMIN',
  'SUPER_ADMIN',
  'ASSET_MANAGER',
  'PROBLEM_MANAGER',
  'CHANGE_MANAGER',
]);

const secretPatterns = [
  { name: 'password=', pattern: /password\s*=\s*\S+/i },
  { name: 'token=', pattern: /token\s*=\s*["']?[A-Za-z0-9._-]{16,}/i },
  { name: 'Bearer <token>', pattern: /bearer\s+[A-Za-z0-9._-]{20,}/i },
  { name: 'privatni ključ', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'veza s lozinkom', pattern: /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/i },
];

const problems = [];
const notes = [];
const fail = (check, message) => problems.push(`[${check}] ${message}`);

function frontmatterOf(content) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (match === null) return null;
  const meta = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      meta[key] = raw
        .slice(1, -1)
        .split(',')
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
        .filter((entry) => entry.length > 0);
    } else {
      meta[key] = /^\d+$/.test(raw) ? Number(raw) : raw;
    }
  }
  return { meta, body: content.slice(match[0].length) };
}

function checkFrontmatter(files) {
  const slugs = new Map();
  const required = ['title', 'slug', 'module', 'part', 'audience', 'roles', 'order', 'tags'];
  for (const file of files) {
    const content = readFileSync(path.join(sourceDir, file), 'utf8');
    const parsed = frontmatterOf(content);
    if (parsed === null) {
      fail('frontmatter', `${file}: nema YAML bloka`);
      continue;
    }
    const { meta, body } = parsed;
    for (const field of required) {
      if (meta[field] === undefined) fail('frontmatter', `${file}: nema polje "${field}"`);
    }
    if (!/^[a-z0-9-]+$/.test(String(meta.slug))) {
      fail('frontmatter', `${file}: slug "${meta.slug}" nije u [a-z0-9-]`);
    }
    const expectedSlug = file.replace(/\.md$/, '');
    if (meta.slug !== expectedSlug) {
      fail('frontmatter', `${file}: slug "${meta.slug}" ne odgovara imenu fajla`);
    }
    if (slugs.has(meta.slug)) {
      fail('frontmatter', `${file}: slug "${meta.slug}" se već koristi u ${slugs.get(meta.slug)}`);
    }
    slugs.set(meta.slug, file);
    if (!knownParts.has(String(meta.part))) {
      fail('frontmatter', `${file}: dio "${meta.part}" nije dozvoljen`);
    }
    if (typeof meta.order !== 'number') {
      fail('frontmatter', `${file}: "order" mora biti broj`);
    }
    for (const role of meta.roles) {
      if (!knownRoles.has(role)) fail('frontmatter', `${file}: nepoznata rola "${role}"`);
    }
    const heading = /^#\s+(.+)$/m.exec(body);
    if (heading === null) {
      fail('frontmatter', `${file}: nema naslova razine 1`);
    } else if (heading[1].trim() !== String(meta.title).trim()) {
      fail('frontmatter', `${file}: title "${meta.title}" ≠ naslov "${heading[1].trim()}"`);
    }
  }
  return slugs;
}

/**
 * `updatedAt` u manifestu **nije** dio kapije: dolazi iz gita (`git log -1 --format=%cs`), pa zavisi od
 * dva stanja okruženja — od dubine klona (plitak klon vraća vršni commit, vidi §3.3) i od trenutka
 * generisanja (datum je tačan samo ako je ogledalo generisano **poslije** commita stranice). Zato se u
 * manifestu porede svi podaci osim `updatedAt`; razlika u datumima se prijavljuje kao napomena.
 */
export function sameManifestIgnoringDates(actualJson, expectedJson) {
  const normalize = (text) => {
    const parsed = JSON.parse(text);
    for (const page of parsed.pages ?? []) {
      page.updatedAt = null;
    }
    return JSON.stringify(parsed);
  };
  try {
    return normalize(actualJson) === normalize(expectedJson);
  } catch {
    return false;
  }
}

/** Slugovi kod kojih se `updatedAt` razlikuje (za napomenu; prazan niz ako se ne mogu pročitati). */
export function differingUpdatedAt(actualJson, expectedJson) {
  const bySlug = (text) =>
    new Map((JSON.parse(text).pages ?? []).map((page) => [page.slug, page.updatedAt ?? null]));
  try {
    const actual = bySlug(actualJson);
    const expected = bySlug(expectedJson);
    const slugs = [];
    for (const slug of new Set([...actual.keys(), ...expected.keys()])) {
      if (actual.get(slug) !== expected.get(slug)) slugs.push(slug);
    }
    return slugs;
  } catch {
    return [];
  }
}

function checkSync() {
  if (!existsSync(mirrorDir)) {
    fail('sinhronizacija', 'ogledalo backend/content/docs ne postoji — pokrenite generator');
    return;
  }
  if (isShallowRepository()) {
    notes.push(
      'plitki klon: `updatedAt` se ne računa iz gita, nego se preuzima iz postojećeg manifesta (§3.3)',
    );
  }
  const { manifest, documents, englishDocuments } = buildDocsContent();
  const expected = new Map();
  for (const [slug, body] of documents) expected.set(`${slug}.md`, body);
  for (const [slug, body] of englishDocuments) expected.set(`en/${slug}.md`, body);
  expected.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, content] of expected) {
    const target = path.join(mirrorDir, name);
    if (!existsSync(target)) {
      fail('sinhronizacija', `nedostaje ${name} — pokrenite generator`);
      continue;
    }
    const actual = readFileSync(target, 'utf8');
    if (actual === content) continue;
    if (name === 'manifest.json' && sameManifestIgnoringDates(actual, content)) {
      const drifted = differingUpdatedAt(actual, content);
      const shown = drifted.slice(0, 5).join(', ');
      const rest = drifted.length > 5 ? ` i još ${drifted.length - 5}` : '';
      notes.push(
        `manifest.json: razlikuju se samo datumi (${drifted.length}: ${shown}${rest}) — osvježi ih u ` +
          'punom klonu poslije commita stranica: `node scripts/generate-docs-content.mjs`',
      );
      continue;
    }
    fail('sinhronizacija', `${name} se razlikuje — pokrenite generator`);
  }
  for (const name of mirrorFiles(mirrorDir)) {
    if (!expected.has(name)) fail('sinhronizacija', `${name} je višak u ogledalu`);
  }
}

/** Svi fajlovi ogledala s relativnim putanjama; uključuje `en/`. */
function mirrorFiles(directory, prefix = '') {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...mirrorFiles(path.join(directory, entry.name), `${relative}/`));
    } else {
      found.push(relative);
    }
  }
  return found;
}

/**
 * Prevodi (`docs/user-guide/en/*.md`): isti slug kao bosanska stranica, isti
 * obavezni frontmatter, i naslov iz frontmattera mora odgovarati `#` naslovu.
 * Ostale provjere (veze, tajne, anchori) rade nad bosanskim izvorima, jer su
 * prevodi isti dokument na drugom jeziku.
 */
/**
 * Čista provjera jednog prevoda, izdvojena radi testa: vraća listu problema.
 * `bosnianSlugs` su slugovi iz `docs/user-guide/*.md` (prevod bez originala je
 * greška, a ne nova stranica).
 */
export function validateTranslation({ file, meta, body, title }, bosnianSlugs) {
  const problems = [];
  const slug = String(meta.slug ?? '');
  if (!bosnianSlugs.has(slug)) {
    problems.push(`en/${file}: slug "${slug}" nema bosanske stranice`);
  }
  if (file !== `${slug}.md`) {
    problems.push(`en/${file}: ime fajla mora biti "<slug>.md"`);
  }
  if (title !== undefined && title !== String(meta.title)) {
    problems.push(`en/${file}: naslov u frontmatteru i naslov "#" se razlikuju`);
  }
  return problems;
}

function checkTranslations() {
  if (!existsSync(englishSourceDir)) {
    return 0;
  }
  const bosnianSlugs = new Set(
    readdirSync(sourceDir)
      .filter((name) => name.endsWith('.md') && name !== technicalSource)
      .map((name) => name.replace(/\.md$/, '')),
  );
  const files = readdirSync(englishSourceDir).filter((name) => name.endsWith('.md')).sort();
  for (const file of files) {
    const content = readFileSync(path.join(englishSourceDir, file), 'utf8');
    const parsed = frontmatterOf(content);
    if (parsed === null) {
      fail('prevodi', `en/${file}: nema YAML bloka`);
      continue;
    }
    const { meta, body } = parsed;
    for (const problem of validateTranslation(
      { file, meta, body, title: body.match(/^#\s+(.+)$/m)?.[1]?.trim() },
      bosnianSlugs,
    )) {
      fail('prevodi', problem);
    }
  }
  return files.length;
}

function checkLinksAndImages(files) {
  for (const file of files) {
    const content = readFileSync(path.join(sourceDir, file), 'utf8');
    const anchors = new Set();
    for (const heading of content.matchAll(/^#{2,3}\s+(.+)$/gm)) {
      anchors.add(slugifyHeading(heading[1].trim()));
    }
    for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:)/i.test(target)) continue;
      // Rute `/docs/...` nisu fajlovi u izvoru — njih provjerava `checkWhatsNewAndRoutes`.
      if (target.startsWith('/docs/')) continue;
      const isImage = match[0].startsWith('!');
      const [filePart, anchor] = target.split('#');
      if (filePart.length === 0 && anchor !== undefined) {
        if (!anchors.has(anchor)) fail('anchori', `${file}: veza #${anchor} ne postoji`);
        continue;
      }
      const resolved = path.resolve(sourceDir, filePart);
      if (!existsSync(resolved)) {
        fail(isImage ? 'slike' : 'veze', `${file}: "${target}" ne postoji`);
        continue;
      }
      if (isImage && !resolved.startsWith(path.join(sourceDir, 'assets') + path.sep)) {
        fail('slike', `${file}: slika "${target}" je izvan docs/user-guide/assets/`);
      }
      if (anchor !== undefined) {
        const targetFile = readFileSync(resolved, 'utf8');
        // Anchori ciljne stranice: own slug + heading slugs (own slug za #naslov?).
        const targetAnchors = new Set();
        for (const heading of targetFile.matchAll(/^#{1,3}\s+(.+)$/gm)) {
          targetAnchors.add(slugifyHeading(heading[1].trim()));
        }
        if (!targetAnchors.has(anchor)) {
          fail('veze', `${file}: "${target}" — anchor #${anchor} ne postoji u ${filePart}`);
        }
      }
    }
  }
}

function checkAnchors(files) {
  for (const file of files) {
    const content = readFileSync(path.join(sourceDir, file), 'utf8');
    const seen = new Map();
    for (const match of content.matchAll(/^#{2,3}\s+(.+)$/gm)) {
      const slug = slugifyHeading(match[1].trim());
      if (slug.length === 0) continue;
      seen.set(slug, (seen.get(slug) ?? 0) + 1);
    }
    for (const [slug, count] of seen) {
      if (count > 1) fail('anchori', `${file}: anchor "#${slug}" se ponavlja ${count}×`);
    }
  }
}

function checkSecrets(files) {
  for (const file of files) {
    const content = readFileSync(path.join(sourceDir, file), 'utf8');
    for (const { name, pattern } of secretPatterns) {
      const match = pattern.exec(content);
      if (match !== null) {
        fail('tajne', `${file}: obrazac "${name}" (${match[0].slice(0, 40)}…)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Faza 3 (dopuna, 2026-10-05): dvije provjere koje su nedostajale.
//
//  1. `rute` — veza `/docs/<slug>(#anchor)` u vodiču mora pogoditi objavljenu
//     stranicu i postojeći naslov (kucanje u ruti se ranije nije hvatalo nigdje).
//  2. `sta-je-novo` — tabela „Šta je novo“ je ručna, pa je val 2 (2026-10-04)
//     prošao bez ijednog reda u njoj. Sada CI traži da zadnji datum u toj tabeli
//     nije stariji od zadnjeg datuma u `DOCS_CHANGELOG.md`; redovi koji su samo
//     interni označavaju se `[interno]` i preskaču se.
// ---------------------------------------------------------------------------

const docsChangelog = path.join(repoRoot, 'DOCS_CHANGELOG.md');
const whatsNewFile = path.join(sourceDir, 'sta-je-novo.md');

/** Sve `YYYY-MM-DD` vrijednosti u tekstu. */
export function isoDates(value) {
  return [...value.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((match) => match[0]);
}

/** Datumi iz tabele „Pregled“ u `DOCS_CHANGELOG.md`, bez `[interno]` redova. */
export function changelogEntryDates(markdown) {
  const dates = [];
  let inOverview = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      inOverview = line.trim() === '## Pregled';
      continue;
    }
    if (!inOverview || !line.startsWith('|')) continue;
    if (line.includes('[interno]')) continue;
    const cells = line.split('|');
    if (cells.length < 4) continue;
    dates.push(...isoDates(cells[2] ?? ''));
  }
  return dates;
}

/** Datumi iz prve tabele na stranici „Šta je novo“. */
export function whatsNewEntryDates(markdown) {
  const dates = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|');
    if (cells.length < 3) continue;
    const cell = (cells[1] ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) dates.push(cell);
  }
  return dates;
}

/** Reference na stranice u jednoj ćeliji: `x.md` (kod) ili `/docs/x` (link). */
export function docsReferencesIn(value) {
  const references = [];
  for (const match of value.matchAll(/`([a-z0-9-]+)\.md`/g)) {
    references.push({ slugOrFile: match[1], anchor: null });
  }
  for (const match of value.matchAll(/\/docs\/([a-z0-9-]+)(#[a-z0-9-]+)?/g)) {
    references.push({ slugOrFile: match[1], anchor: match[2]?.slice(1) ?? null });
  }
  return references;
}

/** Redovi (datum, ćelija sa detaljima) iz tabele „Šta je novo“. */
export function whatsNewRows(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|');
    if (cells.length < 5) continue;
    const date = (cells[1] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ date, details: cells[4] ?? '' });
  }
  return rows;
}

/** Vraća spisak problema (prazan niz = provjera prolazi). */
export function auditWhatsNew({ changelogMarkdown, whatsNewMarkdown, slugs, anchors }) {
  const problems = [];
  const entryDates = changelogEntryDates(changelogMarkdown);
  const rows = whatsNewRows(whatsNewMarkdown);
  const newestEntry = entryDates.sort().at(-1) ?? null;
  const newestRow = rows.map((row) => row.date).sort().at(-1) ?? null;
  if (newestEntry !== null && (newestRow === null || newestRow < newestEntry)) {
    problems.push(
      `DOCS_CHANGELOG.md ima unos ${newestEntry}, a „Šta je novo“ zadnji red ${newestRow ?? '—'}` +
        ' — dodajte red ili označite unos sa `[interno]`',
    );
  }
  for (const row of rows) {
    for (const reference of docsReferencesIn(row.details)) {
      if (!slugs.has(reference.slugOrFile)) {
        problems.push(
          `${row.date}: „${reference.slugOrFile}“ iz kolone Detalji nije objavljena stranica`,
        );
        continue;
      }
      if (reference.anchor !== null && !(anchors.get(reference.slugOrFile)?.has(reference.anchor) ?? false)) {
        problems.push(
          `${row.date}: anchor #${reference.anchor} ne postoji na stranici „${reference.slugOrFile}“`,
        );
      }
    }
  }
  return problems;
}

/**
 * Veze na rute `/docs/…` unutar izvornih vodiča: slug i anchor moraju postojati.
 */
export function auditDocsRoutes({ files, readFile, slugs, anchors }) {
  const problems = [];
  for (const file of files) {
    const content = readFile(file);
    for (const match of content.matchAll(/\]\(\/docs\/([a-z0-9-]+)(#[a-z0-9-]+)?\)/g)) {
      const slug = match[1];
      const anchor = match[2]?.slice(1) ?? null;
      if (!slugs.has(slug)) {
        problems.push(`${file}: ruta „/docs/${slug}“ nema objavljenu stranicu`);
        continue;
      }
      if (anchor !== null && !(anchors.get(slug)?.has(anchor) ?? false)) {
        problems.push(`${file}: ruta „/docs/${slug}#${anchor}“ — anchor ne postoji`);
      }
    }
  }
  return problems;
}

function checkWhatsNewAndRoutes(slugs) {
  const anchors = anchorsBySlug();
  const readGuide = (file) => readFileSync(path.join(sourceDir, file), 'utf8');
  for (const problem of auditDocsRoutes({
    files: readdirSync(sourceDir).filter((name) => name.endsWith('.md')).sort(),
    readFile: readGuide,
    slugs,
    anchors,
  })) {
    fail('rute', problem);
  }
  if (!existsSync(docsChangelog) || !existsSync(whatsNewFile)) {
    fail('sta-je-novo', 'nema DOCS_CHANGELOG.md ili docs/user-guide/sta-je-novo.md');
    return;
  }
  for (const problem of auditWhatsNew({
    changelogMarkdown: readFileSync(docsChangelog, 'utf8'),
    whatsNewMarkdown: readFileSync(whatsNewFile, 'utf8'),
    slugs,
    anchors,
  })) {
    fail('sta-je-novo', problem);
  }
}

function anchorsBySlug() {
  const anchors = new Map();
  for (const name of readdirSync(sourceDir)) {
    if (!name.endsWith('.md') || name === technicalSource) continue;
    const content = readFileSync(path.join(sourceDir, name), 'utf8');
    const parsed = frontmatterOf(content);
    if (parsed === null || parsed.meta.slug === undefined) continue;
    const set = new Set();
    for (const match of content.matchAll(/^#{2,3}\s+(.+)$/gm)) {
      const slug = slugifyHeading(match[1].trim());
      if (slug.length > 0) set.add(slug);
    }
    anchors.set(String(parsed.meta.slug), set);
  }
  return anchors;
}

function checkCodeSlugs(slugs) {
  const scanRoots = [path.join(repoRoot, 'frontend', 'src'), path.join(repoRoot, 'backend', 'src')];
  let found = 0;
  for (const root of scanRoots) {
    if (!existsSync(root)) continue;
    for (const file of walk(root)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const content = readFileSync(file, 'utf8');
      for (const match of content.matchAll(/docsSlug\(\s*['"`]([a-z0-9-]+)['"`]\s*\)/g)) {
        found += 1;
        if (!slugs.has(match[1])) {
          fail('slugovi iz koda', `${path.relative(repoRoot, file)}: "${match[1]}" nema u manifestu`);
        }
      }
    }
  }
  if (found === 0) notes.push('nema `docsSlug(...)` literala u kodu; veza „?" ide kroz mapu ispod');

  // Faza 3 (d): kontekstualna „?" pomoć mapira rute ekrana na stranice; svaki
  // slug (i anchor) iz mape mora postojati u sadržaju.
  const mapFile = path.join(repoRoot, 'frontend', 'src', 'lib', 'docs', 'docs-slug.ts');
  if (!existsSync(mapFile)) {
    fail('slugovi iz koda', 'nema frontend/src/lib/docs/docs-slug.ts (mapa ekran→stranica)');
    return;
  }
  const anchors = anchorsBySlug();
  let mapped = 0;
  const content = readFileSync(mapFile, 'utf8');
  for (const match of content.matchAll(/\{\s*slug:\s*['"]([a-z0-9-]+)['"](?:\s*,\s*anchor:\s*['"]([a-z0-9-]+)['"])?\s*\}/g)) {
    mapped += 1;
    const [, slug, anchor] = match;
    if (!slugs.has(slug)) {
      fail('slugovi iz koda', `docs-slug.ts: stranica "${slug}" nema u manifestu`);
      continue;
    }
    if (anchor !== undefined && !(anchors.get(slug) ?? new Set()).has(anchor)) {
      fail('slugovi iz koda', `docs-slug.ts: anchor "#${anchor}" nema na stranici "${slug}"`);
    }
  }
  if (mapped === 0) notes.push('mapa ekran→stranica je prazna (očekivano u koraku (d))');
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function main() {
  const files = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.md') && name !== technicalSource)
    .sort();
  const slugs = checkFrontmatter(files);
  const translationCount = checkTranslations();
  checkSync();
  checkLinksAndImages(files);
  checkAnchors(files);
  checkSecrets(files);
  checkCodeSlugs(slugs);
  checkWhatsNewAndRoutes(slugs);

  for (const note of notes) {
    console.log(`– ${note}`);
  }
  if (problems.length > 0) {
    console.error(`Docs provjera: ${problems.length} problem(a):`);
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    process.exit(1);
  }
  console.log(
    `Docs provjera: OK (${files.length} stranica, ${translationCount} prevoda, 10 provjera).`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
