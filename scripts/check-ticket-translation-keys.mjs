#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ticketSourceDirectories = [
  "frontend/src/components/tickets",
  "frontend/src/lib/tickets",
];
const pageDirectory = "frontend/src/pages";

function sourceFiles(directory, matches) {
  const result = [];
  for (const name of readdirSync(join(root, directory))) {
    const file = join(directory, name);
    if (statSync(join(root, file)).isDirectory()) {
      result.push(...sourceFiles(file, matches));
    } else if (matches.test(name) && !/\.spec\.(ts|tsx)$/.test(name)) {
      result.push(file);
    }
  }
  return result;
}

function leaves(value, prefix = "") {
  const found = new Set();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof child === "string") {
      found.add(path);
    } else if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      for (const leaf of leaves(child, path)) found.add(leaf);
    }
  }
  return found;
}

function hasTicketLeaf(knownLeaves, key) {
  if (knownLeaves.has(key)) return true;
  return ["one", "few", "other"].some((form) => knownLeaves.has(`${key}_${form}`));
}

function hasPath(value, path) {
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object" || !(part in current)) return false;
    current = current[part];
  }
  return current !== null && typeof current === "object";
}

export function ticketTranslationReferences(source) {
  const keys = new Set();
  const prefixes = new Set();
  const literalKey = /["'`](tickets(?:\.[A-Za-z0-9_]+)+)["'`]/g;
  const dynamicKey = /`(tickets(?:\.[A-Za-z0-9_]+)+)\.\$\{/g;

  for (const match of source.matchAll(literalKey)) keys.add(match[1]);
  for (const match of source.matchAll(dynamicKey)) prefixes.add(match[1]);
  return { keys, prefixes };
}

export function findTicketTranslationIssues(source, locales) {
  const references = ticketTranslationReferences(source);
  const issues = [];
  for (const [locale, dictionary] of Object.entries(locales)) {
    const knownLeaves = leaves(dictionary);
    for (const key of references.keys) {
      if (!hasTicketLeaf(knownLeaves, key)) issues.push({ locale, kind: "key", reference: key });
    }
    for (const prefix of references.prefixes) {
      if (!hasPath(dictionary, prefix)) issues.push({ locale, kind: "prefix", reference: prefix });
    }
  }
  return issues;
}

function main() {
  const locales = Object.fromEntries(
    ["bs", "en"].map((locale) => [
      locale,
      JSON.parse(readFileSync(join(root, `frontend/src/i18n/locales/${locale}/common.json`), "utf8")),
    ]),
  );
  const files = [
    ...ticketSourceDirectories.flatMap((directory) => sourceFiles(directory, /\.(ts|tsx)$/)),
    ...sourceFiles(pageDirectory, /^ticket.*\.tsx$/),
  ];
  const issues = [];
  const keys = new Set();
  const prefixes = new Set();

  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    const found = ticketTranslationReferences(source);
    for (const key of found.keys) keys.add(key);
    for (const prefix of found.prefixes) prefixes.add(prefix);
    for (const issue of findTicketTranslationIssues(source, locales)) {
      issues.push(`${relative(root, file)}: ${issue.reference} is missing from ${issue.locale}`);
    }
  }

  if (issues.length > 0) {
    console.error("Tiketi: nedostaju ključevi prijevoda:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Provjera prijevoda tiketa: OK (${keys.size} ključeva, ${prefixes.size} dinamičkih prefiksa; bs/en).`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
