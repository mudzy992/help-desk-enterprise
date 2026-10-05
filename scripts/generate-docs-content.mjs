#!/usr/bin/env node
/*
  Docs modul (Faza 3, korak b): generator sadržaja.

  Izvor je `docs/user-guide/**` (jedini izvor istine, odluka D1). Ovaj skript:
    1. parsira YAML frontmatter svake stranice,
    2. piše tijelo stranice u `backend/content/docs/<slug>.md`,
    3. piše `backend/content/docs/manifest.json` (metapodaci, TOC, `updatedAt` iz gita).

  Pokretanje:
    node scripts/generate-docs-content.mjs           # piše ogledalo
    node scripts/generate-docs-content.mjs --check   # ne piše; pada ako se ogledalo razlikuje

  `updatedAt` se izvodi iz zadnjeg commita nad izvornim fajlom (`git log -1 --format=%cs`). Ako git istorija
  nije dostupna (shallow klon), koristi se vrijednost iz postojećeg manifesta, a ako ni nje nema - `null`.
*/
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'docs', 'user-guide');
const outputDir = path.join(repoRoot, 'backend', 'content', 'docs');
const technicalSource = 'TEZE-ZA-DOKUMENTACIJU.md';

const partOrder = {
  pocetak: 1,
  korisnik: 2,
  agent: 3,
  administrator: 4,
  operativa: 5,
  referenca: 6,
};

const requiredFields = ['title', 'slug', 'module', 'part', 'audience', 'roles', 'order', 'tags'];

/** Slugifikacija: mala slova, dijakritika u ASCII, ostalo u `-` (isti algoritam kao u UI-u). */
export function slugifyHeading(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
      .filter((entry) => entry.length > 0);
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(file, content) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (match === null) {
    throw new Error(`${file}: nema YAML frontmatter na vrhu fajla`);
  }
  const meta = {};
  for (const line of match[1].split('\n')) {
    if (line.trim().length === 0 || line.trim().startsWith('#')) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new Error(`${file}: neispravan red frontmattera: ${line}`);
    }
    meta[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1));
  }
  for (const field of requiredFields) {
    if (meta[field] === undefined) {
      throw new Error(`${file}: frontmatter nema polje "${field}"`);
    }
  }
  return { meta, body: content.slice(match[0].length) };
}

function collectHeadings(body) {
  const seen = new Map();
  const headings = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const match = /^(#{2,3})\s+(.+)$/.exec(line);
    if (match === null) {
      continue;
    }
    const text = match[2].replace(/#+\s*$/, '').trim();
    const base = slugifyHeading(text) || 'sekcija';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    headings.push({
      level: match[1].length,
      text,
      id: count === 1 ? base : `${base}-${count}`,
    });
  }
  return headings;
}

function gitUpdatedAt(file) {
  try {
    const value = execFileSync('git', ['log', '-1', '--format=%cs', '--', path.relative(repoRoot, file)], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function previousUpdatedAt() {
  const manifestPath = path.join(outputDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return new Map();
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return new Map((manifest.pages ?? []).map((page) => [page.slug, page.updatedAt ?? null]));
  } catch {
    return new Map();
  }
}

/**
 * U izvorima vodiči jedan drugog zovu relativnom vezom (`[vodič](tiketi.md)`),
 * a aplikacija čita ogledalo i ne zna gdje je taj fajl — zato se u ogledalu
 * veza na **objavljenu** stranicu prevodi u rutu `/docs/<slug>` (renderer je
 * prikazuje kao interni link). Veze na fajlove koji nisu stranice (npr.
 * `TEZE-ZA-DOKUMENTACIJU.md`) ostaju kakve jesu.
 */
export function rewriteDocsLinks(body, knownSlugs) {
  return body.replace(/\]\(([a-z0-9-]+)\.md(#[a-z0-9-]+)?\)/g, (match, slug, anchor) =>
    knownSlugs.has(slug) ? `](/docs/${slug}${anchor ?? ''})` : match,
  );
}

export function buildDocsContent() {
  const previous = previousUpdatedAt();
  const files = readdirSync(sourceDir)
    .filter((name) => name.endsWith('.md') && name !== technicalSource)
    .sort();

  const pages = [];
  const documents = new Map();
  const slugs = new Set();
  for (const name of files) {
    const file = path.join(sourceDir, name);
    const { meta, body } = parseFrontmatter(file, readFileSync(file, 'utf8'));
    const slug = String(meta.slug);
    if (slugs.has(slug)) {
      throw new Error(`${name}: slug "${slug}" se već koristi`);
    }
    slugs.add(slug);
    if (!(meta.part in partOrder)) {
      throw new Error(`${name}: nepoznat dio "${meta.part}"`);
    }
    pages.push({
      slug,
      title: String(meta.title),
      module: String(meta.module),
      part: String(meta.part),
      audience: meta.audience,
      roles: meta.roles,
      order: Number(meta.order),
      tags: meta.tags,
      updatedAt: gitUpdatedAt(file) ?? previous.get(slug) ?? null,
      headings: collectHeadings(body),
      wordCount: body.split(/\s+/).filter((word) => word.length > 0).length,
      source: `docs/user-guide/${name}`,
    });
    documents.set(slug, body);
  }

  for (const [slug, body] of documents) {
    documents.set(slug, rewriteDocsLinks(body, slugs));
  }

  pages.sort((a, b) => {
    const byPart = partOrder[a.part] - partOrder[b.part];
    if (byPart !== 0) {
      return byPart;
    }
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.slug.localeCompare(b.slug);
  });

  const manifest = {
    parts: Object.keys(partOrder)
      .map((key) => ({
        key,
        order: partOrder[key],
        pages: pages.filter((page) => page.part === key).map((page) => page.slug),
      }))
      .filter((part) => part.pages.length > 0),
    pages,
  };
  return { manifest, documents };
}

function renderOutputs() {
  const { manifest, documents } = buildDocsContent();
  const outputs = new Map();
  for (const [slug, body] of documents) {
    outputs.set(`${slug}.md`, body);
  }
  outputs.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return outputs;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const outputs = renderOutputs();
  const differences = [];
  for (const [name, content] of outputs) {
    const target = path.join(outputDir, name);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current !== content) {
      differences.push(name);
    }
  }
  if (existsSync(outputDir)) {
    for (const name of readdirSync(outputDir)) {
      if (!outputs.has(name)) {
        differences.push(`${name} (višak)`);
      }
    }
  }

  if (checkOnly) {
    if (differences.length > 0) {
      console.error('Ogledalo sadržaja nije u sinhronizaciji sa docs/user-guide:');
      for (const name of differences) {
        console.error(`  - ${name}`);
      }
      console.error('Pokrenite: node scripts/generate-docs-content.mjs');
      process.exit(1);
    }
    console.log(`Ogledalo je u sinhronizaciji (${outputs.size - 1} stranica + manifest).`);
    return;
  }

  mkdirSync(outputDir, { recursive: true });
  for (const [name, content] of outputs) {
    writeFileSync(path.join(outputDir, name), content, 'utf8');
  }
  for (const name of readdirSync(outputDir)) {
    if (!outputs.has(name)) {
      console.warn(`Uklonjen zastarjeli fajl u ogledalu: ${name}`);
      writeFileSync(path.join(outputDir, name), '', 'utf8');
    }
  }
  console.log(`Generisano ${outputs.size - 1} stranica i manifest u backend/content/docs.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
