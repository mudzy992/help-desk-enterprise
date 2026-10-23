#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const requiredGeneratedFiles = Object.freeze([
  ["client.ts", /export\s+\{\s*PrismaClient/u],
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

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const generated = path.join(root, "backend/src/generated/prisma");
  const problems = await inspectGeneratedPrisma(generated);
  if (problems.length > 0) {
    console.error("Generated Prisma provjera: PROBLEM");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("Pokreni `cd backend && npm run db:generate` prije builda/testova.");
    process.exit(1);
  }
  console.log(`✓ generated Prisma gate: ${requiredGeneratedFiles.length}/${requiredGeneratedFiles.length} obavezna artefakta`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Generated Prisma provjera: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
