/* global console, process */
/*
  W2.20 (`BA-authentication-07`): a clean checkout had no generated Prisma client, so
  24 of the authentication suites failed with `Cannot find module
  '../../generated/prisma/client'` — a stack trace that says nothing about the code
  under test. This setup runs once before the workers (so it also applies when only a
  subset is selected) and:

    * does nothing when the client is already generated (fast path, every CI run);
    * generates it through `scripts/prisma-offline.mjs` when it is missing, which works
      with the network closed (the schema engine is not needed for `generate`);
    * fails with the guard's problem list and an actionable message when generation
      cannot produce the required artifacts.

  Set `PRISMA_SKIP_JEST_GENERATE=1` to opt out (e.g. when diagnosing the guard itself).
*/

module.exports = async () => {
  if (process.env.PRISMA_SKIP_JEST_GENERATE === '1') return;
  // `import()` of the built-ins keeps this file lint-clean without `require()`.
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const backendRoot = path.resolve(__dirname, '..');
  const generated = path.join(backendRoot, 'src', 'generated', 'prisma');
  const guardPath = path.resolve(backendRoot, '..', 'scripts', 'check-generated-prisma.mjs');
  const { inspectGeneratedPrisma } = await import(pathToFileURL(guardPath).href);

  const missing = await inspectGeneratedPrisma(generated);
  if (missing.length === 0) return;

  console.warn(
    `Prisma klijent nije generisan (${missing.length} problema) — generišem ga offline prije testova (W2.20).`,
  );
  const generation = spawnSync(
    process.execPath,
    [path.join(backendRoot, 'scripts', 'prisma-offline.mjs'), 'generate'],
    { cwd: backendRoot, env: process.env, stdio: 'inherit' },
  );
  if (generation.status !== 0) {
    throw new Error(
      `Prisma generate nije uspio (exit ${generation.status ?? 'signal'}). ` +
        'Pokreni `cd backend && npm run db:generate` i provjeri ispis iznad.',
    );
  }
  const stillMissing = await inspectGeneratedPrisma(generated);
  if (stillMissing.length > 0) {
    throw new Error(
      `Prisma klijent je generisan ali guard i dalje prijavljuje probleme: ${stillMissing.join('; ')}. ` +
        'Pokreni `npm run check:prisma-generated` za detalje.',
    );
  }
  console.warn('Prisma klijent je generisan offline; nastavljam sa testovima.');
};
