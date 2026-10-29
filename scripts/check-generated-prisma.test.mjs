import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inspectGeneratedPrisma, requiredGeneratedFiles } from "./check-generated-prisma.mjs";

async function withGeneratedFixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "generated-prisma-"));
  try {
    await mkdir(path.join(directory, "internal"), { recursive: true });
    await writeFile(path.join(directory, "client.ts"), "export { PrismaClient } from './internal/class.js'\n");
    await writeFile(path.join(directory, "enums.ts"), "export const Role = {}\n");
    await writeFile(path.join(directory, "models.ts"), "export type User = {}\n");
    await writeFile(path.join(directory, "internal/class.ts"), "export const getPrismaClient = () => null\n");
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("prihvata kompletan generated client shape", async () => {
  await withGeneratedFixture(async (directory) => {
    assert.deepEqual(await inspectGeneratedPrisma(directory), []);
    assert.equal(requiredGeneratedFiles.length, 4);
  });
});

test("prijavljuje svaki nedostajući obavezni artefakt", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "generated-prisma-empty-"));
  try {
    const problems = await inspectGeneratedPrisma(directory);
    assert.equal(problems.length, requiredGeneratedFiles.length);
    assert.ok(problems.every((problem) => problem.endsWith("nedostaje")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("odbija neprazan ali pogrešan generated fajl", async () => {
  await withGeneratedFixture(async (directory) => {
    await writeFile(path.join(directory, "enums.ts"), "// stale or broken output\n");
    assert.deepEqual(await inspectGeneratedPrisma(directory), [
      "enums.ts: nedostaje očekivani generated marker /export\\s+const/u",
    ]);
  });
});
