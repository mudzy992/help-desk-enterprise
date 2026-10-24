#!/usr/bin/env node
/* global console */
import process from "node:process";
import { pathToFileURL, URL } from "node:url";
import { Client } from "pg";

const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
export function roleProvisionSql(input) {
  if (!input.runtimePassword || !input.migratorPassword) throw new Error("both role passwords are required");
  return `
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'servicedesk_migrator') THEN
    CREATE ROLE servicedesk_migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'servicedesk_runtime') THEN
    CREATE ROLE servicedesk_runtime LOGIN;
  END IF;
END $$;
ALTER ROLE servicedesk_migrator PASSWORD ${quoteLiteral(input.migratorPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE servicedesk_runtime PASSWORD ${quoteLiteral(input.runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT ON DATABASE ${input.databaseIdentifier} TO servicedesk_migrator, servicedesk_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO servicedesk_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, servicedesk_runtime;
GRANT USAGE ON SCHEMA public TO servicedesk_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE servicedesk_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO servicedesk_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE servicedesk_migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO servicedesk_runtime;
`;
}

export function runtimeGrantSql() {
  return `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO servicedesk_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO servicedesk_runtime;`;
}

async function main() {
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) throw new Error("ADMIN_DATABASE_URL is required");
  const database = new URL(url).pathname.slice(1);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database)) throw new Error("unsafe database identifier");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(roleProvisionSql({
      databaseIdentifier: `"${database}"`,
      runtimePassword: process.env.RUNTIME_DB_PASSWORD ?? "",
      migratorPassword: process.env.MIGRATOR_DB_PASSWORD ?? "",
    }));
    if (process.argv.includes("--grant-runtime")) await client.query(runtimeGrantSql());
  } finally {
    await client.end();
  }
  console.log("✓ migrator/runtime database roles provisioned");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`DB roles: PROBLEM — ${error.message}`); process.exit(1); });
}
