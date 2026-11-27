#!/usr/bin/env node
/* global console */
/*
  W2.28 (`BA-authorization-04`, the platform-side defect behind `BA-authentication-07`):
  a clean offline checkout had no `src/generated/prisma` client, so a whole module's
  suites could not even compile and the build failed with a stack trace that said
  nothing about the code under test.

  W2.20 made `generate` offline-safe and taught Jest to run it once before the
  workers. This module is the same precondition for **every** entry point that
  compiles `src/**` (Jest via `scripts/jest-prisma-setup.cjs`, `npm run build` via
  `prebuild`, and any operator command through the CLI below), so nobody has to
  remember the manual `npm run db:generate` step:

    * does nothing when the client is already complete (fast path, every CI run);
    * generates through `scripts/prisma-offline.mjs` when it is missing — that path
      needs no schema engine, so it works with the network closed;
    * fails with the guard's problem list and an actionable message otherwise.
*/
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ensureGeneratedPrismaOutcomes = Object.freeze({
  existing: "existing",
  generated: "generated",
});

const defaultBackendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function loadGeneratedPrismaGuard(backendRoot) {
  const guardPath = path.resolve(
    backendRoot,
    "..",
    "scripts",
    "check-generated-prisma.mjs",
  );
  const guard = await import(pathToFileURL(guardPath).href);
  return guard.inspectGeneratedPrisma;
}

function defaultRunGenerate(backendRoot) {
  return () => {
    const generation = spawnSync(
      process.execPath,
      [path.join(backendRoot, "scripts", "prisma-offline.mjs"), "generate"],
      { cwd: backendRoot, env: process.env, stdio: "inherit" },
    );
    return { status: generation.status, signal: generation.signal };
  };
}

/**
 * Ensures `src/generated/prisma` is complete, generating it offline when needed.
 *
 * @returns {Promise<{outcome: string, problems: readonly string[]}>}
 */
export async function ensureGeneratedPrisma(options = {}) {
  const backendRoot = options.backendRoot ?? defaultBackendRoot;
  const generatedPath =
    options.generatedPath ?? path.join(backendRoot, "src", "generated", "prisma");
  const inspect = options.inspectGeneratedPrisma ?? (await loadGeneratedPrismaGuard(backendRoot));
  const runGenerate = options.runGenerate ?? defaultRunGenerate(backendRoot);
  const warn = options.warn ?? ((message) => console.warn(message));

  const missing = await inspect(generatedPath);
  if (missing.length === 0) {
    return { outcome: ensureGeneratedPrismaOutcomes.existing, problems: [] };
  }

  warn(
    `Prisma klijent nije generisan (${missing.length} problema) — generišem ga offline prije kompajliranja (W2.28).`,
  );
  const generation = runGenerate();
  if (generation.status !== 0) {
    throw new Error(
      `Prisma generate nije uspio (exit ${generation.status ?? "signal"}). ` +
        "Pokreni `cd backend && npm run db:generate` i provjeri ispis iznad.",
    );
  }

  const stillMissing = await inspect(generatedPath);
  if (stillMissing.length > 0) {
    throw new Error(
      `Prisma klijent je generisan ali guard i dalje prijavljuje probleme: ${stillMissing.join("; ")}. ` +
        "Pokreni `npm run check:prisma-generated` za detalje.",
    );
  }
  warn("Prisma klijent je generisan offline; nastavljam.");
  return {
    outcome: ensureGeneratedPrismaOutcomes.generated,
    problems: [],
  };
}

async function main() {
  if (process.env.PRISMA_SKIP_ENSURE_GENERATED === "1") {
    console.log("Prisma precondition preskočen (PRISMA_SKIP_ENSURE_GENERATED=1).");
    return;
  }
  const { outcome } = await ensureGeneratedPrisma();
  if (outcome === ensureGeneratedPrismaOutcomes.existing) {
    console.log("✓ generated Prisma klijent je već kompletan");
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Prisma precondition: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
