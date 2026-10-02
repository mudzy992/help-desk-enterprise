#!/usr/bin/env node
// Keeps the root `.env.example` authoritative (Paket 4.1 §7a). It fails when:
//  - backend code reads an environment variable that the example does not list;
//  - the example lists a variable that no backend code reads.
// A variable counts as "listed" whether it is active (`NAME=`) or commented out
// (`# NAME=`). Compose-only and frontend build variables are allow-listed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["backend/src"];
// Variables used outside backend/src (compose, Vite build, tooling).
const allowedUnread = [/^WORKER_DB_/, /^VITE_/, /^NODE_ENV$/, /^PORT$/];
// Variables read by code but intentionally not part of the deployment contract.
const allowedUnlisted = new Set(["NODE_ENV", "JEST_WORKER_ID", "npm_package_version"]);

const readPatterns = [
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
  /\b(?:env|environment|source)\??\.([A-Z][A-Z0-9_]{2,})\b/g,
  /EnvironmentKey\w*\s*=\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g,
  /\b(?:env|environment|source)\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
];
// Files that map setting names to env names as string literals.
const literalKeyFiles = new Set([
  "backend/src/common/database/database-pool.constants.ts",
  "backend/src/common/redis/redis.constants.ts",
]);

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name)) files.push(path);
  }
  return files;
}

const read = new Map();
for (const sourceRoot of sourceRoots) {
  for (const file of walk(join(root, sourceRoot))) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    const patterns = [...readPatterns];
    if (literalKeyFiles.has(rel)) patterns.push(/["'`]([A-Z][A-Z0-9_]{2,})["'`]/g);
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (!read.has(match[1])) read.set(match[1], rel);
      }
    }
  }
}

const listed = new Set();
for (const line of readFileSync(join(root, ".env.example"), "utf8").split(/\r?\n/)) {
  const match = /^\s*#?\s*([A-Z][A-Z0-9_]+)=/.exec(line);
  if (match) listed.add(match[1]);
}

const problems = [];
for (const [name, file] of read) {
  if (!listed.has(name) && !allowedUnlisted.has(name)) {
    problems.push(`${name} is read in ${file} but missing from .env.example`);
  }
}
for (const name of listed) {
  if (!read.has(name) && !allowedUnread.some((pattern) => pattern.test(name))) {
    problems.push(`${name} is listed in .env.example but no backend code reads it`);
  }
}

if (problems.length > 0) {
  console.error("check-env-example: .env.example is out of sync with the code:");
  for (const problem of problems.sort()) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`check-env-example: ${listed.size} variables, in sync with backend code.`);
