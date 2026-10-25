#!/usr/bin/env node
/* global console */
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { URL, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

export const integrationSpecs = Object.freeze([
  "src/common/principal-context/role-assignment-analyzer.integration.spec.ts",
  "src/common/principal-context/user-role-constraint-migration.integration.spec.ts",
  "src/common/principal-context/principal-authority.integration.spec.ts",
  "src/modules/authentication/session-revocation.integration.spec.ts",
  "src/modules/authorization/evaluate-resource-policy.integration.spec.ts",
  "src/modules/authorization/route-authorization-negative-matrix.integration.spec.ts",
  "src/modules/audit-log/partitioned-audit-chain.integration.spec.ts",
  "src/modules/security/step-up-policy.integration.spec.ts",
  "src/modules/privacy/retention/retention.integration.spec.ts",
  "src/modules/privacy/anonymization/anonymization.integration.spec.ts",
  "src/modules/privacy/export/export.integration.spec.ts",
  "src/modules/status-page/status-page.integration.spec.ts",
  "src/modules/ops-health/ops-alert.engine.integration.spec.ts",
]);

export function buildDatabaseName(index, spec) {
  const slug = path.basename(spec).replace(/[^a-z0-9]+/giu, "_").replace(/^_|_$/gu, "").slice(0, 32);
  return `it_${process.pid}_${index}_${slug}`.toLowerCase();
}

export function withDatabaseName(connectionString, databaseName) {
  if (!/^[a-z0-9_]+$/u.test(databaseName)) throw new Error("nesigurno ime integration baze");
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value) {
  if (!/^[a-z0-9_]+$/u.test(value)) throw new Error("nesiguran PostgreSQL identifier");
  return `"${value}"`;
}

function runJest(spec, databaseUrl) {
  const jest = path.resolve("node_modules/jest/bin/jest.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [jest, "--runInBand", "--runTestsByPath", spec], {
      stdio: "inherit",
      env: { ...process.env, PRIVACY_IT_DATABASE_URL: databaseUrl },
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${spec} nije prošao (exit=${code ?? "null"}, signal=${signal ?? "none"})`));
    });
  });
}

export async function runIsolatedIntegration(connectionString, specs = integrationSpecs) {
  const base = new URL(connectionString);
  const templateName = base.pathname.replace(/^\//u, "");
  if (!/^[a-zA-Z0-9_]+$/u.test(templateName)) throw new Error("DATABASE_URL mora imati sigurno ime baze");
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5_000 });
  await admin.connect();
  try {
    for (const [index, spec] of specs.entries()) {
      const databaseName = buildDatabaseName(index + 1, spec);
      const identifier = quoteIdentifier(databaseName);
      try {
        await admin.query(`CREATE DATABASE ${identifier} TEMPLATE ${quoteIdentifier(templateName)}`);
        console.log(`\n=== isolated integration: ${spec} (${databaseName}) ===`);
        await runJest(spec, withDatabaseName(connectionString, databaseName));
      } finally {
        await admin.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`);
      }
    }
  } finally {
    await admin.end();
  }
  console.log(`✓ isolated PostgreSQL integration: ${specs.length}/${specs.length} suiteova`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL je obavezan");
  await runIsolatedIntegration(connectionString);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Isolated integration: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
