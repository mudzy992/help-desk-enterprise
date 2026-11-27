/* global console */
/*
  W2.28 (`BA-authorization-04`): the artifact contract lives inside `backend/` so that
  every consumer — the repo-level guard, the Jest `globalSetup`, the `prebuild`
  precondition and the Docker builder (whose build context is `backend/`) — reads the
  same four required files. The repo-level `scripts/check-generated-prisma.mjs` is the
  CLI and re-exports this implementation.
*/
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const requiredGeneratedFiles = Object.freeze([
  ["client.ts", /PrismaClient/u],
  ["enums.ts", /export\s+const/u],
  ["models.ts", /export\s+type/u],
  ["internal/class.ts", /getPrismaClient/u],
]);

export async function inspectGeneratedPrisma(directory) {
  const problems = [];
  for (const [relative, marker] of requiredGeneratedFiles) {
    const file = path.join(directory, relative);
    try {
      const metadata = await stat(file);
      const source = await readFile(file, "utf8");
      if (!metadata.isFile() || metadata.size === 0) {
        problems.push(`${relative}: nije neprazan fajl`);
      } else if (!marker.test(source)) {
        problems.push(`${relative}: nedostaje očekivani generated marker ${marker}`);
      }
    } catch (error) {
      problems.push(`${relative}: ${error.code === "ENOENT" ? "nedostaje" : error.message}`);
    }
  }
  return problems;
}

export function reportGeneratedPrismaProblems(problems, write = console.error) {
  write("Generated Prisma provjera: PROBLEM");
  for (const problem of problems) write(`  - ${problem}`);
  write("Pokreni `cd backend && npm run db:generate` prije builda/testova.");
}
