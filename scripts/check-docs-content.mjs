#!/usr/bin/env node
/*
  Docs modul (Faza 3, korak b): validacija sadržaja prije commita i u CI.

  Provjerava sedam stvari iz `docs/DOCS_MODULE.md` §9:
    1. frontmatter (obavezna polja, slug, dio, role, order, naslov = `#` naslov),
    2. sinhronizacija ogledala `backend/content/docs` sa `docs/user-guide/**`,
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
import { fileURLToPath } from 'node:url';
import { buildDocsContent, slugifyHeading } from './generate-docs-content.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'docs', 'user-guide');
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

function checkSync() {
  if (!existsSync(mirrorDir)) {
    fail('sinhronizacija', 'ogledalo backend/content/docs ne postoji — pokrenite generator');
    return;
  }
  const { manifest, documents } = buildDocsContent();
  const expected = new Map();
  for (const [slug, body] of documents) expected.set(`${slug}.md`, body);
  expected.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, content] of expected) {
    const target = path.join(mirrorDir, name);
    if (!existsSync(target)) {
      fail('sinhronizacija', `nedostaje ${name} — pokrenite generator`);
      continue;
    }
    if (readFileSync(target, 'utf8') !== content) {
      fail('sinhronizacija', `${name} se razlikuje — pokrenite generator`);
    }
  }
  for (const name of readdirSync(mirrorDir)) {
    if (!expected.has(name)) fail('sinhronizacija', `${name} je višak u ogledalu`);
  }
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
  checkSync();
  checkLinksAndImages(files);
  checkAnchors(files);
  checkSecrets(files);
  checkCodeSlugs(slugs);

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
  console.log(`Docs provjera: OK (${files.length} stranica, 7 provjera).`);
}

main();
