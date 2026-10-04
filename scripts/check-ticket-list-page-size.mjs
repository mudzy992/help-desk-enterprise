#!/usr/bin/env node
// Guards the ticket-list page size across the two apps.
//
// Staging, 2026-10-03: the dashboard volume chart asked for `pageSize=100`
// while `GET /tickets` accepts at most 50 (`@Max(ticketListPaging.maxPageSize)`
// in `list-tickets-query.dto.ts`), so the whole request failed with
// `VALIDATION: pageSize must not be greater than 50`. The chart was empty and
// the UI only showed the generic error text.
//
// Two checks, both cheap:
//  1. the frontend constant `ticketListMaxPageSize` must equal the backend
//     `ticketListPaging.maxPageSize` — change one and this fails;
//  2. no frontend `listTicketsPage({ ... pageSize: <number> })` literal may be
//     above that maximum.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

const backendConstantsPath = "backend/src/modules/tickets/list/list-tickets.constants.ts";
const frontendConstantsPath = "frontend/src/lib/tickets/ticket-constants.ts";

const backendSource = readFileSync(join(root, backendConstantsPath), "utf8");
const backendMax = readNumber(
  backendSource,
  /maxPageSize:\s*(\d+)/,
  `${backendConstantsPath}: nema \`maxPageSize\``,
);
const frontendSource = readFileSync(join(root, frontendConstantsPath), "utf8");
const frontendMax = readNumber(
  frontendSource,
  /ticketListMaxPageSize\s*=\s*(\d+)/,
  `${frontendConstantsPath}: nema \`ticketListMaxPageSize\``,
);

if (backendMax !== null && frontendMax !== null && backendMax !== frontendMax) {
  problems.push(
    `${frontendConstantsPath} traži ${frontendMax}, a ${backendConstantsPath} dozvoljava ${backendMax} — usaglasi ih`,
  );
}

// Nema izuzetaka: u frontend-u nema nijednog drugog numeričkog `pageSize`
// literala, pa svaki preko granice jeste greška (i test-otpadak se hvata).
const limit = frontendMax ?? backendMax ?? 50;
for (const file of walk(join(root, "frontend/src"))) {
  if (!/\.tsx?$/.test(file) || file.endsWith(".spec.ts") || file.endsWith(".spec.tsx")) {
    continue;
  }
  const source = readFileSync(file, "utf8");
  for (const [index, line] of source.split("\n").entries()) {
    const match = /pageSize:\s*(\d+)/.exec(line);
    if (match === null) continue;
    const value = Number(match[1]);
    if (value > limit) {
      problems.push(
        `${relative(root, file)}:${index + 1} traži pageSize ${value}, a server prihvata najviše ${limit}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Provjera veličine stranice liste tiketa: PROBLEM");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `Provjera veličine stranice liste tiketa: OK (frontend i backend na ${limit})`,
);

function readNumber(source, pattern, message) {
  const match = pattern.exec(source);
  if (match === null) {
    problems.push(message);
    return null;
  }
  return Number(match[1]);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}
