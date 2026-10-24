#!/usr/bin/env node
/* global console */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export function validateContainerContract(dockerfile, compose) {
  const problems = [];
  const stages = [...dockerfile.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+([^\s]+))?\s*$/gimu)];
  const finalStage = dockerfile.slice(dockerfile.lastIndexOf("FROM "));
  const requireFinal = (pattern, message) => {
    if (!pattern.test(finalStage)) problems.push(`Dockerfile runtime: ${message}`);
  };
  const digestPattern = /^node:22-alpine@sha256:[a-f0-9]{64}$/u;
  if (stages.length < 3 || stages.some((stage) => !digestPattern.test(stage[1]))) {
    problems.push("Dockerfile supply chain: svaki stage mora koristiti digest-pinned node:22-alpine");
  }
  if (/npm\s+ci[^\n]*(?:\|\||;)\s*npm\s+install/u.test(dockerfile)) {
    problems.push("Dockerfile supply chain: npm ci ne smije imati npm install fallback");
  }
  if (!/^FROM\s+[^\s]+\s+AS\s+production-deps\s*$[\s\S]*?RUN npm ci --omit=dev --omit=optional --ignore-scripts/mu.test(dockerfile)) {
    problems.push("Dockerfile supply chain: nedostaje strict production-only dependency stage");
  }
  requireFinal(/^USER\s+node\s*$/mu, "nedostaje `USER node`");
  requireFinal(/^STOPSIGNAL\s+SIGTERM\s*$/mu, "nedostaje `STOPSIGNAL SIGTERM`");
  requireFinal(/RUN mkdir -p \/usr\/app\/uploads && chown node:node \/usr\/app\/uploads/u, "uploads ownership nije pripremljen");
  requireFinal(/COPY --chown=node:node --from=builder/u, "builder artefakti nisu kopirani kao node owner");
  requireFinal(/COPY --chown=node:node --from=production-deps \/usr\/app\/node_modules \.\/node_modules/u, "runtime ne koristi production-only dependencies");
  if (/--from=builder \/usr\/app\/node_modules/u.test(finalStage)) {
    problems.push("Dockerfile runtime: builder node_modules ne smije u runtime");
  }
  requireFinal(/ENV UPLOAD_ROOT=\/usr\/app\/uploads/u, "UPLOAD_ROOT nije apsolutni persistent path");

  for (const service of ["backend", "worker"]) {
    const start = compose.indexOf(`  ${service}:`);
    if (start < 0) {
      problems.push(`compose: nedostaje ${service} servis`);
      continue;
    }
    const next = compose.slice(start + 2).search(/^ {2}[a-z][a-z0-9-]*:/mu);
    const block = compose.slice(start, next < 0 ? undefined : start + 2 + next);
    const checks = [
      [/^ {4}read_only: true$/mu, "read_only"],
      [/^ {4}cap_drop:\n {6}- ALL$/mu, "cap_drop ALL"],
      [/^ {4}security_opt:\n {6}- no-new-privileges:true$/mu, "no-new-privileges"],
      [/^ {4}tmpfs:\n {6}- \/tmp:rw,noexec,nosuid,size=64m,mode=1777$/mu, "bounded /tmp tmpfs"],
      [/^ {4}volumes:\n {6}- uploads:\/usr\/app\/uploads$/mu, "persistent uploads volume"],
    ];
    for (const [pattern, label] of checks) if (!pattern.test(block)) problems.push(`compose ${service}: nedostaje ${label}`);
  }
  return problems;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const [dockerfile, compose] = await Promise.all([
    readFile(path.join(root, "backend/Dockerfile"), "utf8"),
    readFile(path.join(root, "docker-compose.yml"), "utf8"),
  ]);
  const problems = validateContainerContract(dockerfile, compose);
  if (problems.length > 0) {
    console.error("Backend container contract: PROBLEM");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("✓ backend container contract: non-root, SIGTERM, read-only, dropped caps, bounded tmpfs, persistent uploads");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Backend container contract: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
