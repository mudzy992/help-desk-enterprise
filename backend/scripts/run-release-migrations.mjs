#!/usr/bin/env node
/* global console */
import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
import { Client } from "pg";

export const migrationLockKey = 7_214_902_117;

export function validateMigrationEnvironment(environment) {
  const migrationUrl = environment.MIGRATION_DATABASE_URL?.trim();
  const runtimeUrl = environment.DATABASE_URL?.trim();
  if (!migrationUrl) throw new Error("MIGRATION_DATABASE_URL is required");
  if (runtimeUrl) {
    const migrationUser = decodeURIComponent(new URL(migrationUrl).username);
    const runtimeUser = decodeURIComponent(new URL(runtimeUrl).username);
    if (!migrationUser || migrationUser === runtimeUser) {
      throw new Error("migration and runtime database users must be distinct");
    }
  }
  if (environment.NODE_ENV === "production" && new URL(migrationUrl).searchParams.get("sslmode") !== "verify-full") {
    throw new Error("production MIGRATION_DATABASE_URL requires sslmode=verify-full");
  }
  return migrationUrl;
}

function runPrisma(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--no-install", "prisma", "migrate", "deploy"], {
      stdio: "inherit",
      env: { ...environment, DATABASE_URL: environment.MIGRATION_DATABASE_URL },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`prisma migrate deploy failed (${signal ?? code})`)));
  });
}

export async function runReleaseMigrations(environment = process.env, migrate = runPrisma) {
  const connectionString = validateMigrationEnvironment(environment);
  const client = new Client({ connectionString, application_name: "service-desk-release-migrator" });
  await client.connect();
  try {
    const acquired = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [migrationLockKey]);
    if (acquired.rows[0]?.acquired !== true) throw new Error("another release migrator owns the advisory lock");
    await client.query("SET lock_timeout = '5s'");
    await client.query("SET statement_timeout = '10min'");
    await migrate(environment);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLockKey]).catch(() => undefined);
    await client.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReleaseMigrations().then(() => console.log("✓ single-owner release migrations completed")).catch((error) => {
    console.error(`Release migrations: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
