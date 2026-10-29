import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyPostgres, verifyRedis } from "./dependency-smoke.mjs";

test("PostgreSQL probe uvijek rollbackuje transakciju", async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT COUNT")) return { rows: [{ count: 1 }] };
      return { rows: [] };
    },
  };
  await verifyPostgres(client);
  assert.deepEqual(calls, [
    "BEGIN",
    'CREATE TEMP TABLE "_safety_net_probe" ("value" integer NOT NULL) ON COMMIT DROP',
    'INSERT INTO "_safety_net_probe" ("value") VALUES (1)',
    'SELECT COUNT(*)::integer AS "count" FROM "_safety_net_probe"',
    "ROLLBACK",
  ]);
});

test("PostgreSQL probe rollbackuje i nakon greške", async () => {
  const calls = [];
  const client = {
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("INSERT")) throw new Error("write failed");
      return { rows: [] };
    },
  };
  await assert.rejects(() => verifyPostgres(client), /write failed/u);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("Redis probe čita vrijednost i uklanja namespaced ključ", async () => {
  const values = new Map();
  const calls = [];
  const client = {
    set: async (key, value, ...options) => {
      calls.push(["set", key, ...options]);
      if (values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    get: async (key) => values.get(key) ?? null,
    del: async (key) => {
      calls.push(["del", key]);
      return values.delete(key) ? 1 : 0;
    },
  };
  await verifyRedis(client, "safety-net:test");
  assert.deepEqual(calls[0], ["set", "safety-net:test", "EX", 30, "NX"]);
  assert.deepEqual(calls.at(-1), ["del", "safety-net:test"]);
});
