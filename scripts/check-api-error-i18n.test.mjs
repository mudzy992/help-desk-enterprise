import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectViolations, extractBackendCodes, extractFrontendCodes } from "./check-api-error-i18n.mjs";

const backendError = (codes) =>
  `export type DirectorySyncErrorCode =\n${codes.map((code) => `  | '${code}'`).join("\n")};\n`;

const frontendKeys = (codes) =>
  `const KNOWN_CODES = [\n${codes.map((code) => `  "${code}",`).join("\n")}\n] as const;\n`;

const locale = (codes) =>
  JSON.stringify(
    { directory: { ldaps: { errors: Object.fromEntries(codes.map((code) => [code, `text ${code}`])) } } },
    null,
    2,
  );

function createFixture({ backendCodes, frontendCodes, translations, surface }) {
  const root = mkdtempSync(path.join(tmpdir(), "api-error-i18n-"));
  const write = (relative, content) => {
    const file = path.join(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  write("backend/src/modules/directory-sync/directory-sync.error.ts", backendError(backendCodes));
  write("frontend/src/lib/directory/directory-sync-error-key.ts", frontendKeys(frontendCodes));
  for (const language of ["bs", "en"]) {
    write(
      `frontend/src/i18n/locales/${language}/common.json`,
      locale(translations[language] ?? backendCodes.concat("unknown")),
    );
  }
  write("frontend/src/components/organizational-units/card.tsx", surface);
  return root;
}

const cleanSurface = `export function Card({ error }: { error: unknown }) {\n  return t(directorySyncErrorKey(error));\n}\n`;

test("extracts codes from the backend union and the frontend list", () => {
  assert.deepEqual(extractBackendCodes(backendError(["A_CODE", "B_CODE"])), ["A_CODE", "B_CODE"]);
  assert.deepEqual(extractFrontendCodes(frontendKeys(["A_CODE"])), ["A_CODE"]);
});

test("accepts a surface that maps codes to keys", () => {
  const root = createFixture({
    backendCodes: ["DIRECTORY_READ_DISABLED"],
    frontendCodes: ["DIRECTORY_READ_DISABLED"],
    translations: {},
    surface: cleanSurface,
  });
  try {
    assert.deepEqual(
      collectViolations(root, { rawMessageExceptions: [] }),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when the backend can emit a code the frontend does not know", () => {
  const root = createFixture({
    backendCodes: ["DIRECTORY_READ_DISABLED", "INVALID_SCOPE"],
    frontendCodes: ["DIRECTORY_READ_DISABLED"],
    translations: {},
    surface: cleanSurface,
  });
  try {
    const violations = collectViolations(root, { rawMessageExceptions: [] });
    assert.equal(violations.length, 1);
    assert.match(violations[0], /INVALID_SCOPE/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when a locale is missing a translation", () => {
  const root = createFixture({
    backendCodes: ["DIRECTORY_READ_DISABLED"],
    frontendCodes: ["DIRECTORY_READ_DISABLED"],
    translations: { en: ["DIRECTORY_READ_DISABLED", "unknown"], bs: ["unknown"] },
    surface: cleanSurface,
  });
  try {
    const violations = collectViolations(root, { rawMessageExceptions: [] });
    assert.equal(violations.length, 1);
    assert.match(violations[0], /bs.*DIRECTORY_READ_DISABLED/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails when a surface renders the raw backend message", () => {
  const root = createFixture({
    backendCodes: ["DIRECTORY_READ_DISABLED"],
    frontendCodes: ["DIRECTORY_READ_DISABLED"],
    translations: {},
    surface: `export function Card({ error }: { error: unknown }) {\n  return error instanceof ApiError ? error.message : "fallback";\n}\n`,
  });
  try {
    const violations = collectViolations(root, { rawMessageExceptions: [] });
    assert.equal(violations.length, 1);
    assert.match(violations[0], /card\.tsx:2/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an exception that no longer matches fails instead of rotting", () => {
  const root = createFixture({
    backendCodes: ["DIRECTORY_READ_DISABLED"],
    frontendCodes: ["DIRECTORY_READ_DISABLED"],
    translations: {},
    surface: cleanSurface,
  });
  try {
    const violations = collectViolations(root, {
      rawMessageExceptions: [
        {
          file: "frontend/src/components/organizational-units/card.tsx",
          fragment: "caught.message",
          reason: "test",
        },
      ],
    });
    assert.equal(violations.length, 1);
    assert.match(violations[0], /više ne postoji/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
