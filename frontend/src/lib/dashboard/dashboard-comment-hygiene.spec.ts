import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

describe("dashboard production comment hygiene", () => {
  it("does not reintroduce implementation-phase labels", () => {
    const frontendRoot = process.cwd();
    const repositoryRoot = join(frontendRoot, "..");
    const files = [
      join(frontendRoot, "src", "pages", "dashboard-page.tsx"),
      join(frontendRoot, "src", "services", "report-summary-api.ts"),
      join(frontendRoot, "src", "services", "setup-checklist-api.ts"),
      ...sourceFiles(join(frontendRoot, "src", "components", "dashboard")),
      ...sourceFiles(join(frontendRoot, "src", "lib", "dashboard")),
      ...sourceFiles(join(repositoryRoot, "backend", "src", "modules", "reports", "summary")),
      join(repositoryRoot, "backend", "src", "modules", "reports", "report-summary.service.ts"),
      ...sourceFiles(join(repositoryRoot, "backend", "src", "modules", "setup-checklist")),
    ];
    const historicalLabel = /\b(?:paket|package|phase|faza|val)\s+\d|\bM\d+\b|\bF\d+\.\d+\b/i;
    const violations = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ path, line: index + 1, text: line.trim() }))
        .filter(({ text }) => historicalLabel.test(text)),
    );

    expect(violations).toEqual([]);
  });
});
