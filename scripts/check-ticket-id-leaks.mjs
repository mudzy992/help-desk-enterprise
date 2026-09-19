#!/usr/bin/env node
// Guards the "never show raw ids" rule on ticket screens (see
// 02-FAZNI-PLAN-IMPLEMENTACIJE-TIKETI.md, Faza 2.2). It flags an identifier
// field rendered as visible JSX text, e.g. `{ticket.parentTicketId}`.
// Identifiers used as attribute values (`value={...}`, `to={...}`, `key={...}`)
// or inside template literals (`${...}`) are legitimate and ignored.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanTargets = [
  { dir: "frontend/src/components/tickets", filePattern: /\.tsx$/ },
  { dir: "frontend/src/pages", filePattern: /^ticket-.*\.tsx$/ },
];
const identifierFields = [
  "originUnitId",
  "assignedGroupId",
  "assignedUserId",
  "requesterId",
  "serviceId",
  "formVersionId",
  "parentTicketId",
];
const leakPattern = new RegExp(
  `(?<![=$\\w])\\{[A-Za-z]+\\.(?:${identifierFields.join("|")})\\}`,
);

function listFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const findings = [];
for (const target of scanTargets) {
  const files = listFiles(join(root, target.dir)).filter(
    (path) =>
      target.filePattern.test(path.split(/[\\/]/).pop() ?? "") &&
      !/\.spec\.tsx?$/.test(path),
  );
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (leakPattern.test(line)) {
          findings.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
        }
      });
  }
}

if (findings.length > 0) {
  console.error("Raw identifiers rendered on ticket screens:\n" + findings.join("\n"));
  process.exit(1);
}
console.log("check-ticket-id-leaks: no raw identifiers rendered on ticket screens.");
