/* global process, console */
/*
  W2.20 (`BA-authentication-07`): a clean checkout had no generated Prisma client, so
  whole modules failed with `Cannot find module '../../generated/prisma/client'` — a
  stack trace that says nothing about the code under test. This setup runs once before
  the workers (so it also applies when only a subset is selected).

  W2.28 (`BA-authorization-04`): the generation policy itself moved to
  `scripts/ensure-generated-prisma.mjs`, which `npm run build` uses too — Jest is one
  entry point, not the only one. The behaviour is unchanged: fast path when the client
  exists, offline generate when it is missing, actionable failure otherwise.

  Set `PRISMA_SKIP_JEST_GENERATE=1` to opt out (e.g. when diagnosing the guard itself).
*/

module.exports = async () => {
  if (process.env.PRISMA_SKIP_JEST_GENERATE === "1") return;
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const helperPath = path.resolve(__dirname, "ensure-generated-prisma.mjs");
  const { ensureGeneratedPrisma } = await import(pathToFileURL(helperPath).href);

  await ensureGeneratedPrisma({
    backendRoot: path.resolve(__dirname, ".."),
    warn: (message) => console.warn(message),
  });
};
