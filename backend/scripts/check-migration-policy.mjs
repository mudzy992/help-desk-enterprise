#!/usr/bin/env node
/* global console */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const destructive = /\b(?:DROP\s+(?:TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)|TRUNCATE\b|ALTER\s+TABLE[\s\S]{0,200}\bDROP\b)/iu;
export function validateMigrationPolicy(migrations, manifest) {
  const problems = [];
  const approvals = new Map((manifest.approvals ?? []).map((item) => [item.migration, item]));
  for (const migration of migrations) {
    if (!destructive.test(migration.sql)) continue;
    const approval = approvals.get(migration.name);
    const digest = createHash("sha256").update(migration.sql).digest("hex");
    if (!approval) problems.push(`${migration.name}: destructive SQL nema approval`);
    else if (approval.sha256 !== digest) problems.push(`${migration.name}: approval hash je stale`);
    else if (!approval.approval?.trim()) problems.push(`${migration.name}: approval razlog je prazan`);
  }
  for (const name of approvals.keys()) if (!migrations.some((item) => item.name === name)) problems.push(`${name}: approval nema migraciju`);
  return problems;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const migrationRoot = path.join(root, "backend/prisma/migrations");
  const names = (await readdir(migrationRoot, { withFileTypes: true })).filter((item) => item.isDirectory()).map((item) => item.name);
  const migrations = await Promise.all(names.map(async (name) => ({ name, sql: await readFile(path.join(migrationRoot, name, "migration.sql"), "utf8") })));
  const manifest = JSON.parse(await readFile(path.join(root, "ops/migrations/destructive-approvals.json"), "utf8"));
  const contract = await readFile(path.join(root, "backend/src/common/database/database-runtime-contract.ts"), "utf8");
  const expected = contract.match(/expectedSchemaMigration\s*=\s*\n?\s*['"]([^'"]+)/u)?.[1];
  const problems = validateMigrationPolicy(migrations, manifest);
  const latest = names.sort().at(-1);
  if (expected !== latest) problems.push(`schema sentinel je stale: expected=${expected ?? "missing"}, latest=${latest}`);
  if (problems.length) throw new Error(problems.join("\n"));
  console.log(`✓ migration policy: ${migrations.length} migrations, destructive SQL approval hashes valid`);
}
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exit(1); });
