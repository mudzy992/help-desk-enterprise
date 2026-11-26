#!/usr/bin/env node
/* global console */
import process from 'node:process';
/*
  W2.20 (`BA-authentication-07`): sentinel for `PRISMA_SCHEMA_ENGINE_BINARY`.

  Prisma's CLI checks that a schema-engine binary is *present* before it dispatches
  any command, and downloads one from `binaries.prisma.sh` when it is not. `generate`,
  `validate` and `format` never execute it — they use the WASM engine bundled in the
  `prisma` package — so `scripts/prisma-offline.mjs` points the variable here instead
  of letting the CLI go to the network.

  If any Prisma version or code path ever does execute this file, the failure is loud
  and tells the operator what to do, instead of silently generating something wrong.
*/

console.error(
  [
    'Prisma schema engine nije dostupan: ovaj fajl je offline sentinel iz',
    '`backend/scripts/prisma-offline.mjs`, ne pravi engine.',
    '',
    'Komande koje stvarno trebaju engine (migrate/db) pokreni bez wrappera ili stage-uj',
    'binar preko PRISMA_SCHEMA_ENGINE_BINARY (pinovani commit je u prisma/engines.lock.json).',
  ].join('\n'),
);
process.exit(1);
