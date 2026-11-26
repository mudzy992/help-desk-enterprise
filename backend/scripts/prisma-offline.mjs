#!/usr/bin/env node
/* global console */
/*
  W2.20 (`BA-authentication-07`): `prisma generate`/`validate` used to be a network
  operation. Prisma 7 fetches `schema-engine` from `binaries.prisma.sh` on the first
  CLI call of *any* command (`ensureBinariesExist` runs before the command is even
  dispatched — `prisma generate --help` fails without the binary). On a clean,
  network-restricted machine that makes the generated client impossible to build, and
  then 24 of the authentication suites die on `Cannot find module
  '../../generated/prisma/client'` instead of on anything they test.

  The binary is not actually used by `generate`, `validate` or `format`: Prisma 7
  parses the schema and builds the DMMF from the WASM engine that ships inside the
  `prisma` npm package (`build/schema_engine_bg.wasm`, `build/prisma_schema_build_bg.wasm`).
  The download is only the CLI's eager "make sure every binary exists" step.

  This wrapper therefore runs exactly those three commands with
  `PRISMA_SCHEMA_ENGINE_BINARY` pointed at a checked-in sentinel file. The sentinel
  exists so the CLI's "is a binary available?" check passes without any download; it
  is a script that prints an actionable error and exits 1 if anything ever *executes*
  it, so a future Prisma version that starts using the native engine for these
  commands fails loudly instead of silently.

  Everything else (`migrate`, `db`, `migrate status`, …) genuinely needs the real
  schema engine, so the wrapper does not touch those commands: they keep Prisma's
  normal behaviour (download, or the operator's `PRISMA_SCHEMA_ENGINE_BINARY` /
  `PRISMA_ENGINES_MIRROR`). The pinned engine commit for that path is recorded in
  `prisma/engines.lock.json` and enforced by `scripts/prisma-offline.test.mjs`.
*/

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Commands that build/check the client from the schema alone — no native engine needed. */
export const offlineSafeCommands = Object.freeze(['generate', 'validate', 'format']);

/** The checked-in stand-in for the schema engine, used only by the commands above. */
export const sentinelFileName = 'prisma-offline-schema-engine.mjs';

/** Fallback used by `generate`: `prisma.config.ts` resolves `env("DATABASE_URL")`. */
export const placeholderDatabaseUrl =
  'postgresql://prisma-offline:unused@127.0.0.1:5432/unused';

/**
 * Decide how one Prisma invocation should run. Pure on purpose: the unit test proves
 * the decision for every command class without spawning the CLI.
 */
export function planInvocation({ command, env = {}, sentinelPath, databaseUrlFallback = placeholderDatabaseUrl }) {
  if (command === undefined || command === '') {
    return { offline: false, reason: 'no-command', env: { ...env } };
  }
  if (!offlineSafeCommands.includes(command)) {
    return { offline: false, reason: 'engine-required', env: { ...env } };
  }
  const nextEnv = { ...env };
  if (typeof nextEnv.DATABASE_URL !== 'string' || nextEnv.DATABASE_URL.length === 0) {
    nextEnv.DATABASE_URL = databaseUrlFallback;
  }
  const staged = nextEnv.PRISMA_SCHEMA_ENGINE_BINARY;
  if (typeof staged === 'string' && staged.length > 0) {
    return { offline: true, reason: 'operator-engine', env: nextEnv };
  }
  nextEnv.PRISMA_SCHEMA_ENGINE_BINARY = sentinelPath;
  nextEnv.PRISMA_HIDE_UPDATE_MESSAGE = '1';
  return { offline: true, reason: 'sentinel', env: nextEnv };
}

function resolvePaths() {
  const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
  const backendRoot = path.resolve(scriptsDirectory, '..');
  return {
    backendRoot,
    sentinelPath: path.join(scriptsDirectory, sentinelFileName),
    cliPath: path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js'),
  };
}

function main(argv) {
  const [command, ...rest] = argv;
  const { backendRoot, sentinelPath, cliPath } = resolvePaths();
  if (!existsSync(cliPath)) {
    console.error(
      'Prisma CLI nije instaliran (nedostaje node_modules/prisma). Pokreni `npm ci` u backend/.',
    );
    return 1;
  }
  if (!existsSync(sentinelPath)) {
    console.error(`Prisma offline sentinel nedostaje: ${sentinelPath}`);
    return 1;
  }
  const plan = planInvocation({ command, env: process.env, sentinelPath });
  if (plan.reason === 'engine-required') {
    console.error(
      `Prisma: „${command}“ zahtijeva pravi schema engine; wrapper ga ne zamjenjuje sentinelom.`,
    );
  }
  const result = spawnSync(process.execPath, [cliPath, command, ...rest], {
    cwd: backendRoot,
    env: plan.env,
    stdio: 'inherit',
  });
  if (result.error !== undefined) {
    console.error(`Prisma wrapper: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
