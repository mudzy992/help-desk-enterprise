#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// W2.28 (`BA-authorization-04`): the artifact contract is implemented inside
// `backend/scripts/` so the Docker builder (context `backend/`) can read it too.
export {
  inspectGeneratedPrisma,
  requiredGeneratedFiles,
} from "../backend/scripts/inspect-generated-prisma.mjs";
import {
  inspectGeneratedPrisma,
  reportGeneratedPrismaProblems,
  requiredGeneratedFiles,
} from "../backend/scripts/inspect-generated-prisma.mjs";

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const generated = path.join(root, "backend/src/generated/prisma");
  const problems = await inspectGeneratedPrisma(generated);
  if (problems.length > 0) {
    reportGeneratedPrismaProblems(problems);
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
