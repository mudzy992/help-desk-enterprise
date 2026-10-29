#!/usr/bin/env node
/* global console */
import process from "node:process";
import { Client } from "pg";

const url = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("RUNTIME_DATABASE_URL is required");
const client = new Client({ connectionString: url });
await client.connect();
try {
  const capabilities = await client.query(`SELECT
    has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
    has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    current_user AS role`);
  const row = capabilities.rows[0];
  if (row.schema_create || row.database_create) throw new Error(`runtime role ${row.role} still has CREATE privilege`);
  await client.query('SELECT 1');
  try {
    await client.query('CREATE TABLE public."_runtime_must_not_ddl" (id integer)');
    throw new Error("runtime CREATE TABLE unexpectedly succeeded");
  } catch (error) {
    if (error.code !== '42501') throw error;
  }
  console.log(`✓ restricted runtime role ${row.role}: DML/read works, DDL denied`);
} finally {
  await client.end();
}
