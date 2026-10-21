import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "frontend/dist");
const manifestPath = resolve(dist, ".vite/manifest.json");

export const budgets = Object.freeze({
  chunkGzipBytes: 250 * 1024,
  initialGzipBytes: 250 * 1024,
  // Baselines measured on 2026-10-21; the 5% headroom is the explicit regression allowance.
  loginGzipBytes: Math.ceil(254_000 * 1.05),
  requesterDashboardGzipBytes: Math.ceil(261_000 * 1.05),
});

export function collectStaticImports(manifest, entryKeys) {
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const item = manifest[key];
    if (!item) throw new Error(`Manifest entry is missing: ${key}`);
    visited.add(key);
    for (const imported of item.imports ?? []) visit(imported);
  };
  for (const key of entryKeys) visit(key);
  return visited;
}

async function gzipBytes(relativePath) {
  return gzipSync(await readFile(resolve(dist, relativePath))).byteLength;
}

async function routeBytes(manifest, entryKeys) {
  const files = new Set();
  for (const key of collectStaticImports(manifest, entryKeys)) {
    const item = manifest[key];
    files.add(item.file);
    for (const css of item.css ?? []) files.add(css);
  }
  let total = 0;
  for (const file of files) total += await gzipBytes(file);
  return total;
}

function assertBudget(label, actual, maximum) {
  if (actual > maximum) {
    throw new Error(`${label}: ${actual} gzip bytes exceeds budget ${maximum}`);
  }
  console.log(`✓ ${label}: ${actual}/${maximum} gzip bytes`);
}

export async function checkBundleBudget() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const required = [
    "index.html",
    "src/pages/login-page.tsx",
    "src/pages/dashboard-page.tsx",
    "src/pages/tickets-page.tsx",
    "src/pages/ticket-list-page.tsx",
    "src/pages/ticket-create-page.tsx",
    "src/pages/ticket-detail-page.tsx",
    "src/pages/services-page.tsx",
    "src/pages/knowledge-base-page.tsx",
    "src/pages/knowledge-article-detail-page.tsx",
    "src/pages/appearance-page.tsx",
    "src/pages/auth-callback-page.tsx",
  ];
  for (const key of required) {
    if (!manifest[key]?.file) throw new Error(`Required lazy route is absent from manifest: ${key}`);
  }

  let largestChunk = { file: "", bytes: 0 };
  for (const item of Object.values(manifest)) {
    if (!item.file?.endsWith(".js")) continue;
    const bytes = await gzipBytes(item.file);
    if (bytes > budgets.chunkGzipBytes) {
      throw new Error(`chunk ${item.file}: ${bytes} gzip bytes exceeds budget ${budgets.chunkGzipBytes}`);
    }
    if (bytes > largestChunk.bytes) largestChunk = { file: item.file, bytes };
  }
  console.log(
    `✓ largest JavaScript chunk ${largestChunk.file}: ${largestChunk.bytes}/${budgets.chunkGzipBytes} gzip bytes`,
  );

  assertBudget(
    "initial application path",
    await routeBytes(manifest, ["index.html"]),
    budgets.initialGzipBytes,
  );
  assertBudget(
    "login cold path",
    await routeBytes(manifest, ["index.html", "src/pages/login-page.tsx"]),
    budgets.loginGzipBytes,
  );
  assertBudget(
    "requester dashboard cold path",
    await routeBytes(manifest, ["index.html", "src/pages/dashboard-page.tsx"]),
    budgets.requesterDashboardGzipBytes,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkBundleBudget().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
