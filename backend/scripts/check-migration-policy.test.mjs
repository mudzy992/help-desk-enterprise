import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { validateMigrationPolicy } from "./check-migration-policy.mjs";
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("zahtijeva hashovano odobrenje za destruktivni SQL", () => {
  const sql = 'ALTER TABLE "Ticket" DROP COLUMN "legacy";';
  assert.deepEqual(validateMigrationPolicy([{ name: "m1", sql }], { approvals: [] }), ["m1: destructive SQL nema approval"]);
  assert.deepEqual(validateMigrationPolicy([{ name: "m1", sql }], { approvals: [{ migration: "m1", sha256: hash(sql), approval: "CAB-42" }] }), []);
});

test("odbija stale hash i approval bez migracije", () => {
  const problems = validateMigrationPolicy([{ name: "m1", sql: "DROP TABLE x;" }], {
    approvals: [{ migration: "m1", sha256: "stale", approval: "CAB" }, { migration: "missing", sha256: "x", approval: "CAB" }],
  });
  assert.ok(problems.some((item) => item.includes("stale")));
  assert.ok(problems.some((item) => item.includes("nema migraciju")));
});

test("BA-templates-07 migration locks and preflights duplicate live names before creating its partial index", async () => {
  const sql = await readFile(
    new URL("../prisma/migrations/20271030150000_playbook_live_name_unique/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /LOCK TABLE "Playbook" IN SHARE ROW EXCLUSIVE MODE/iu);
  assert.match(sql, /FROM "Playbook"\s+WHERE "deletedAt" IS NULL\s+GROUP BY lower\("name"\)\s+HAVING COUNT\(\*\) > 1/iu);
  const guard = sql.indexOf("RAISE EXCEPTION");
  const index = sql.indexOf('CREATE UNIQUE INDEX "playbook_live_name_lower_key"');
  assert.ok(guard >= 0 && guard < index, "dupe guard must abort before the unique index is created");
  assert.match(sql, /ON "Playbook" \(lower\("name"\)\)\s+WHERE "deletedAt" IS NULL/iu);
});
