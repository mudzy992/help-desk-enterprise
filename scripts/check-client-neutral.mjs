#!/usr/bin/env node
// Guards the multi-client rule (Paket 4.1 §9, widened in Paket 4.1a §6): no
// tracked file may carry the name, domain, abbreviation or e-mail header of a
// single client. The list of forbidden forms lives in `clientFormsIn` below and
// is covered by `check-client-neutral.test.mjs` (one positive example per form,
// plus negatives such as `step`, `REPORT` and `help desk`).
//
// Two rules stay deliberately separate:
//  - the `git grep` prefilter is coarse and locale-independent (a middle dot is
//    two bytes, so it uses `.{0,3}` instead of `·` and never decides alone);
//  - `clientFormsIn` is the decision and runs on every line the prefilter finds.
//
// Exceptions are limited to data that must stay readable forever (legacy KDF
// labels, applied migrations), the client's original SRS files, package-lock
// files (base64 hashes can contain `EP`), the audit designs (they must quote the
// forms), the guard and its test, and — until A9 is closed — the staging cutover
// handoff. The localStorage migration table is allowed line by line: a legacy
// key is only accepted when the same line also names its neutral
// `service-desk.*` replacement.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Coarse prefilter for `git grep -E`. Wider than the decision on purpose, and
// free of multi-byte characters so it cannot depend on the locale.
export const clientNamePrefilter = [
  "epbih",
  "ep.{0,3}bih",
  "elektroprivred",
  "ep.{0,3}help.{0,3}desk",
  "ep.{0,1}hd",
  "ep.{0,1}ba",
  "ep.{0,1}grupa",
  "ep.{0,1}ticket",
  "(^|[^a-z0-9])ep([^a-z0-9]|$)",
].join("|");

// Separators this product uses between the short client mark and a word.
const SEPARATOR = "[ _·./-]";

// Full and shortened client name forms, case-insensitively.
const clientNameForms = new RegExp(
  [
    "epbih",
    `ep${SEPARATOR}?bih`,
    "elektroprivred",
    `ep${SEPARATOR}?help${SEPARATOR}?desk`,
    "ep[ _-]?hd\\b",
    `ep${SEPARATOR}?ba\\b`,
    "ep[ .-]?grupa",
    "ep[ _-]?ticket",
  ].join("|"),
  "i",
);

// The bare short form counts only when it stands alone (in upper case): the OU
// root `EP/Sarajevo`, a login `EP\ahodzic`, ticket ids `EP-10xx`, the brand mark
// `EP·HelpDesk`. `step`, `REPORT` and `help desk` must not match.
const standaloneShortForm = /(^|[^A-Za-z0-9])EP([^A-Za-z0-9]|$)/;

const excludedPathspecs = [
  ":(exclude)package-lock.json",
  ":(exclude)backend/prisma/migrations/**",
  ":(exclude)backend/src/common/crypto/legacy-kdf-labels.ts",
  ":(exclude)EPHELPDESK.pdf",
  ":(exclude)EPHELPDESK.docx",
  ":(exclude)docs/plans/modules/4.1-audit-vise-klijenata.md",
  ":(exclude)docs/plans/modules/4.1a-skracenice-klijenta.md",
  // Temporary (Paket 4.1, A9): the staging cutover handoff has to quote the old
  // Redis user, key prefixes and backup directory verbatim, because its commands
  // depend on them. Remove this line together with the file when A9 is closed.
  ":(exclude)docs/plans/HANDOFF-4.1-A9.md",
  ":(exclude)scripts/check-client-neutral.mjs",
  ":(exclude)scripts/check-client-neutral.test.mjs",
];
// References to the SRS files by name are fine; the files themselves are kept.
const allowedFragments = [/EPHELPDESK\.(pdf|docx)(\/\.pdf)?/g];
const storageMigrationLine = /["'](?:ep-helpdesk|ephelpdesk)\.[\w.]+["']\s*,\s*["']service-desk\.[\w.]+["']/;
const storageMigrationFiles = new Set([
  "frontend/index.html",
  "frontend/src/lib/storage/legacy-storage-keys.ts",
]);

/** Every client-specific form found in one line of text (decision function). */
export function clientFormsIn(text) {
  const found = [];
  const name = clientNameForms.exec(text);
  if (name) found.push(name[0]);
  const short = standaloneShortForm.exec(text);
  if (short) found.push(short[0]);
  return found;
}

function scan() {
  let output = "";
  try {
    output = execFileSync(
      "git",
      ["grep", "-n", "-I", "-i", "-E", clientNamePrefilter, "--", ".", ...excludedPathspecs],
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
    const forms = clientFormsIn(rest);
    if (forms.length === 0) continue;
    findings.push(`${file}:${line}: ${text.trim().slice(0, 160)}`);
  }
  return findings;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const findings = scan();
  if (findings.length > 0) {
    console.error("check-client-neutral: client-specific names found (Paket 4.1 §9, 4.1a §6):");
    for (const finding of findings) console.error(`  ${finding}`);
    console.error("Use a setting, `example.com` or the neutral product name „Service Desk“ instead.");
    process.exit(1);
  }
  console.log("check-client-neutral: no client-specific names in tracked files.");
}
