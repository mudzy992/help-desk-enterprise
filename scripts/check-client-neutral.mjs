#!/usr/bin/env node
// Guards the multi-client rule (Paket 4.1 §9): no tracked file may carry the
// name, domain or abbreviation of a single client. Exceptions are limited to
// data that must stay readable forever (legacy KDF labels, applied migrations),
// the client's original SRS files and the audit design itself. The localStorage
// migration table is allowed line by line: a legacy key is only accepted when
// the same line also names its neutral `service-desk.*` replacement.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = /epbih|ep[ _-]?bih\b|elektroprivred|ep[ _-]?help[ _-]?desk/i;
const excludedPathspecs = [
  ":(exclude)backend/prisma/migrations/**",
  ":(exclude)backend/src/common/crypto/legacy-kdf-labels.ts",
  ":(exclude)EPHELPDESK.pdf",
  ":(exclude)EPHELPDESK.docx",
  ":(exclude)docs/plans/modules/4.1-audit-vise-klijenata.md",
  ":(exclude)scripts/check-client-neutral.mjs",
];
// References to the SRS files by name are fine; the files themselves are kept.
const allowedFragments = [/EPHELPDESK\.(pdf|docx)(\/\.pdf)?/g];
const storageMigrationLine = /["'](?:ep-helpdesk|ephelpdesk)\.[\w.]+["']\s*,\s*["']service-desk\.[\w.]+["']/;
const storageMigrationFiles = new Set([
  "frontend/index.html",
  "frontend/src/lib/storage/legacy-storage-keys.ts",
]);

let output = "";
try {
  output = execFileSync(
    "git",
    ["grep", "-n", "-I", "-i", "-E", "epbih|ep[ _-]?bih|elektroprivred|ep[ _-]?help[ _-]?desk", "--", ".", ...excludedPathspecs],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
} catch (error) {
  if (error.status !== 1) throw error; // 1 = no matches
}

const findings = [];
for (const entry of output.split("\n")) {
  if (!entry) continue;
  const [, file, line, text] = /^(.*?):(\d+):(.*)$/.exec(entry) ?? [];
  if (!file) continue;
  let rest = text;
  for (const fragment of allowedFragments) rest = rest.replace(fragment, "");
  if (storageMigrationFiles.has(file) && storageMigrationLine.test(rest)) continue;
  if (!forbidden.test(rest)) continue;
  findings.push(`${file}:${line}: ${text.trim().slice(0, 160)}`);
}

if (findings.length > 0) {
  console.error("check-client-neutral: client-specific names found (Paket 4.1 §9):");
  for (const finding of findings) console.error(`  ${finding}`);
  console.error("Use a setting, `example.com` or the neutral product name „Service Desk“ instead.");
  process.exit(1);
}
console.log("check-client-neutral: no client-specific names in tracked files.");
