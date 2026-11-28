#!/usr/bin/env node
/**
 * W2.37b gate: no backend sentence may reach the screen, and every directory
 * error code must be translated in both locales.
 *
 * Why this exists: the manual-read card rendered `ApiError.message`, i.e. the
 * backend's English `"Directory read is disabled"`, inside a Bosnian screen. The
 * frontend already had `directorySyncErrorKey()` and both locales already had the
 * translation, but nothing forced the card to use them — so no existing guard
 * noticed.
 *
 * The check has two rules:
 *
 * 1. **Coverage** — every `DirectorySyncErrorCode` the backend can emit has a
 *    frontend key (`directory.ldaps.errors.<CODE>`), and that key exists in
 *    `bs` and `en` together with `directory.ldaps.errors.unknown`. Adding a
 *    backend code therefore fails here instead of surfacing English text.
 * 2. **Usage** — the directory surfaces may not read `.message` from a caught
 *    API error. Files that still show a technical detail are listed below with a
 *    reason, so an exception is a reviewable line, not a silent habit.
 *
 * `--write` is not supported: every finding is a code change.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const backendErrorFile = "backend/src/modules/directory-sync/directory-sync.error.ts";
const frontendKeyFile = "frontend/src/lib/directory/directory-sync-error-key.ts";
const locales = ["bs", "en"];

/** Directory surfaces where a raw backend sentence is never acceptable. */
const scannedDirectories = [
  "frontend/src/components/organizational-units",
  "frontend/src/lib/directory",
  "frontend/src/components/assets",
];

/**
 * Reviewed exceptions. Each entry names the file, the exact line fragment and the
 * reason; the fragment must still appear in the file, so a fixed file fails the
 * guard instead of keeping a stale exemption.
 */
const rawMessageExceptions = [
  {
    file: "frontend/src/components/assets/asset-transfer-settings-card.tsx",
    fragment: "caught.message",
    reason:
      "import validation detail of ASSET_TRANSFER_TEMPLATE_INVALID (row/column list); moving it to codes is tracked separately",
  },
];

const rawMessagePattern = /\b(?:error|caught|apiError|err)\.message\b/u;
const codePattern = /'([A-Z][A-Z0-9_]+)'/gu;

export function extractBackendCodes(source) {
  const unionMatch = source.match(/DirectorySyncErrorCode\s*=([\s\S]*?);/u);
  if (unionMatch === null) {
    throw new Error("ne mogu pronaći DirectorySyncErrorCode union");
  }
  const codes = new Set();
  for (const match of unionMatch[1].matchAll(codePattern)) {
    codes.add(match[1]);
  }
  return [...codes].sort();
}

export function extractFrontendCodes(source) {
  const listMatch = source.match(/KNOWN_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/u);
  if (listMatch === null) {
    throw new Error("ne mogu pronaći KNOWN_CODES listu");
  }
  const codes = new Set();
  for (const match of listMatch[1].matchAll(/"([A-Z][A-Z0-9_]+)"/gu)) {
    codes.add(match[1]);
  }
  return [...codes].sort();
}

export function readTranslations(root, locale) {
  const file = path.join(root, `frontend/src/i18n/locales/${locale}/common.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function listSourceFiles(root, relativeDirectory) {
  const absolute = path.join(root, relativeDirectory);
  const collected = [];
  if (!existsSync(absolute)) {
    return collected;
  }
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(?:ts|tsx)$/u.test(entry) && !/\.spec\./u.test(entry)) {
        collected.push(full);
      }
    }
  };
  walk(absolute);
  return collected;
}

export function collectViolations(root, options = {}) {
  const scanned = options.scannedDirectories ?? scannedDirectories;
  const exceptions = options.rawMessageExceptions ?? rawMessageExceptions;
  const violations = [];

  const backendCodes = extractBackendCodes(
    readFileSync(path.join(root, backendErrorFile), "utf8"),
  );
  const frontendCodes = extractFrontendCodes(
    readFileSync(path.join(root, frontendKeyFile), "utf8"),
  );
  const missingInFrontend = backendCodes.filter((code) => !frontendCodes.includes(code));
  if (missingInFrontend.length > 0) {
    violations.push(
      `${frontendKeyFile}: nedostaju kodovi ${missingInFrontend.join(", ")} — ` +
        "svaki DirectorySyncError kod mora imati frontend ključ",
    );
  }

  for (const locale of locales) {
    const translations = readTranslations(root, locale);
    const errors = translations?.directory?.ldaps?.errors;
    if (errors === undefined || typeof errors !== "object") {
      violations.push(`frontend/src/i18n/locales/${locale}/common.json: nedostaje directory.ldaps.errors`);
      continue;
    }
    for (const code of [...backendCodes, "unknown"]) {
      if (typeof errors[code] !== "string" || errors[code].trim().length === 0) {
        violations.push(
          `frontend/src/i18n/locales/${locale}/common.json: nedostaje prijevod directory.ldaps.errors.${code}`,
        );
      }
    }
  }

  for (const directory of scanned) {
    for (const file of listSourceFiles(root, directory)) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      const lines = readFileSync(file, "utf8").split(/\r?\n/u);
      lines.forEach((line, index) => {
        if (!rawMessagePattern.test(line)) {
          return;
        }
        if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) {
          return;
        }
        const exempt = exceptions.some(
          (exception) =>
            exception.file === relative && line.includes(exception.fragment),
        );
        if (!exempt) {
          violations.push(
            `${relative}:${index + 1}: sirova backend poruka (${line.trim()}) — ` +
              "koristi directorySyncErrorKey()/mapApiError() i i18n ključ",
          );
        }
      });
    }
  }

  for (const exception of exceptions) {
    const file = path.join(root, exception.file);
    let content = "";
    try {
      content = readFileSync(file, "utf8");
    } catch {
      violations.push(`${exception.file}: izuzetak pokazuje na fajl koji ne postoji`);
      continue;
    }
    if (!content.includes(exception.fragment)) {
      violations.push(
        `${exception.file}: izuzetak „${exception.fragment}" više ne postoji — ukloni ga iz liste`,
      );
    }
  }

  return violations;
}

export function formatResult(violations) {
  if (violations.length === 0) {
    return "check-api-error-i18n: OK (kôdovi pokriveni u bs+en, nema sirovih backend poruka)";
  }
  return [
    "check-api-error-i18n: PROBLEM",
    ...violations.map((violation) => `  - ${violation}`),
  ].join("\n");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const violations = collectViolations(repoRoot);
  console.log(formatResult(violations));
  if (violations.length > 0) {
    process.exitCode = 1;
  }
}
