import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureGeneratedPrisma,
  ensureGeneratedPrismaOutcomes,
} from "./ensure-generated-prisma.mjs";

const backendRoot = "/repo/backend";
const generatedPath = "/repo/backend/src/generated/prisma";

function recorder(problemsByCall, options = {}) {
  const calls = { inspect: 0, generate: 0, warnings: [] };
  const inspectGeneratedPrisma = async (directory) => {
    assert.equal(directory, generatedPath);
    calls.inspect += 1;
    return problemsByCall[Math.min(calls.inspect - 1, problemsByCall.length - 1)];
  };
  const runGenerate = () => {
    calls.generate += 1;
    return options.generation ?? { status: 0, signal: null };
  };
  const warn = (message) => calls.warnings.push(message);
  return { calls, inspectGeneratedPrisma, runGenerate, warn };
}

function run(problemsByCall, options) {
  const harness = recorder(problemsByCall, options);
  const result = ensureGeneratedPrisma({
    backendRoot,
    generatedPath,
    inspectGeneratedPrisma: harness.inspectGeneratedPrisma,
    runGenerate: harness.runGenerate,
    warn: harness.warn,
  });
  return { result, ...harness };
}

test("a complete client is a no-op: no generation, no noise", async () => {
  const { result, calls } = run([[]]);

  assert.equal((await result).outcome, ensureGeneratedPrismaOutcomes.existing);
  assert.deepEqual(calls, { inspect: 1, generate: 0, warnings: [] });
});

test("a missing client is generated once and re-verified", async () => {
  const { result, calls } = run([["client.ts: nedostaje"], []]);

  assert.equal((await result).outcome, ensureGeneratedPrismaOutcomes.generated);
  assert.equal(calls.inspect, 2);
  assert.equal(calls.generate, 1);
  assert.match(calls.warnings[0], /nije generisan \(1 problema\)/u);
  assert.match(calls.warnings.at(-1), /generisan offline/u);
});

test("a failed generation names the manual command instead of a module error", async () => {
  const { result, calls } = run([["client.ts: nedostaje"]], {
    generation: { status: 1, signal: null },
  });

  await assert.rejects(result, /Prisma generate nije uspio \(exit 1\).*npm run db:generate/iu);
  assert.equal(calls.generate, 1);
});

test("generation that does not satisfy the guard fails with the problem list", async () => {
  const { result } = run([
    ["client.ts: nedostaje"],
    ["models.ts: nedostaje"],
  ]);

  await assert.rejects(result, /guard i dalje prijavljuje probleme: models\.ts: nedostaje/u);
});
