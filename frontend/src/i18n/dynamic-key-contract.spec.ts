import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = new URL("../", import.meta.url).pathname;

function productionSources(directory = sourceRoot): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path === join(sourceRoot, "components", "install")) continue;
      result.push(...productionSources(path));
    } else if (/\.(?:ts|tsx)$/.test(path) && !/\.spec\.(?:ts|tsx)$/.test(path)) {
      result.push(path);
    }
  }
  return result;
}

describe("dynamic translation key contract", () => {
  it("does not bypass i18next key types outside the separately scoped install UI", () => {
    const violations = productionSources().flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          /\bt\([^\n]*\bas never\b|\bt as never\b/.test(line)
            ? [`${relative(sourceRoot, path)}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );
    expect(violations).toEqual([]);
  });

  it("keeps the priority domain helpers free of untyped translation escapes", () => {
    for (const file of [
      "lib/on-call/on-call-view.ts",
      "components/shortcuts/shortcuts-help-dialog.tsx",
      "lib/audit/audit-log-i18n.ts",
      "lib/problems/problem-view.ts",
      "lib/changes/change-history-text.ts",
      "lib/sla/format-sla-escalation-target.ts",
    ]) {
      expect(readFileSync(join(sourceRoot, file), "utf8"), file).not.toContain("as never");
    }
  });
});
