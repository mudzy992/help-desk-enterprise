#!/usr/bin/env node
/* global console */
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString)
  throw new Error("DATABASE_URL je obavezan za BA-10 Perf fixture");
if (process.env.PERF_CATALOG_FIXTURE_ALLOW_SEED !== "true") {
  throw new Error(
    "BA-10 Perf fixture zahtijeva PERF_CATALOG_FIXTURE_ALLOW_SEED=true",
  );
}

const runToken = [
  process.env.GITHUB_RUN_ID ?? Date.now().toString(36),
  process.env.GITHUB_RUN_ATTEMPT ?? "1",
].join("-");
const idPrefix = `ba10-perf-${runToken}`;
const slugPrefix = `${idPrefix}-service`;
const fixtureSize = 500;
const pool = new Pool({ connectionString });

try {
  const categoryResult = await pool.query(
    'SELECT "id" FROM "ServiceCategory" ORDER BY "id" ASC LIMIT 1',
  );
  const categoryId = categoryResult.rows[0]?.id;
  if (typeof categoryId !== "string") {
    throw new Error(
      "Install seed nije kreirao service category za BA-10 Perf fixture",
    );
  }

  await pool.query(
    `INSERT INTO "Service" (
       "id", "name", "slug", "categoryId", "lifecycle", "createdAt", "updatedAt"
     )
     SELECT
       $2 || '-' || lpad(series.n::text, 4, '0'),
       'BA-10 Perf service ' || lpad(series.n::text, 4, '0') || ' ' || $2,
       $3 || '-' || lpad(series.n::text, 4, '0'),
       $1,
       'ACTIVE'::"ServiceLifecycle",
       NOW(),
       NOW()
     FROM generate_series(0, $4::int - 1) AS series(n)
     ON CONFLICT ("slug") DO NOTHING`,
    [categoryId, idPrefix, slugPrefix, fixtureSize],
  );

  const verification = await pool.query(
    'SELECT COUNT(*)::int AS "count" FROM "Service" WHERE "slug" LIKE $1 || \'-%\'',
    [slugPrefix],
  );
  const seededCount = Number(verification.rows[0]?.count ?? 0);
  if (seededCount !== fixtureSize) {
    throw new Error(
      `BA-10 Perf fixture nije potpun: ${seededCount}/${fixtureSize} servisa`,
    );
  }
  console.log(
    `BA-10 Perf fixture: ${seededCount} ACTIVE servisa; kategorija ${categoryId}`,
  );
} finally {
  await pool.end();
}
