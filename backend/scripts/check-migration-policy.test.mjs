import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
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
