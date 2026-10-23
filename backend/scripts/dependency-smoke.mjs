#!/usr/bin/env node
/* global console */
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import Redis from "ioredis";

export async function verifyPostgres(client) {
  await client.query("BEGIN");
  try {
    await client.query('CREATE TEMP TABLE "_safety_net_probe" ("value" integer NOT NULL) ON COMMIT DROP');
    await client.query('INSERT INTO "_safety_net_probe" ("value") VALUES (1)');
    const result = await client.query('SELECT COUNT(*)::integer AS "count" FROM "_safety_net_probe"');
    if (result.rows[0]?.count !== 1) throw new Error("PostgreSQL probe count nije 1");
  } finally {
    await client.query("ROLLBACK");
  }
}

export async function verifyRedis(client, key = `safety-net:${process.pid}:${Date.now()}`) {
  const value = `probe-${Date.now()}`;
  try {
    const set = await client.set(key, value, "EX", 30, "NX");
    if (set !== "OK") throw new Error("Redis probe SET NX nije vratio OK");
    if ((await client.get(key)) !== value) throw new Error("Redis probe nije pročitao zapisanu vrijednost");
  } finally {
    await client.del(key);
  }
  if ((await client.get(key)) !== null) throw new Error("Redis probe cleanup nije uklonio ključ");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const redisHost = process.env.REDIS_HOST?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL je obavezan");
  if (!redisHost) throw new Error("REDIS_HOST je obavezan");

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  const redis = new Redis({
    host: redisHost,
    port: Number(process.env.REDIS_PORT ?? 6379),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
  });
  try {
    await verifyPostgres(pool);
    await redis.connect();
    await verifyRedis(redis);
    console.log("✓ dependency smoke: PostgreSQL read/write/rollback + Redis read/write/cleanup");
  } finally {
    await Promise.allSettled([pool.end(), redis.quit()]);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Dependency smoke: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
