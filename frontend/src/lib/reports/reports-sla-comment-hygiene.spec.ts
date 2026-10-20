import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

function productionSources(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.includes(".spec.")
      ? [path]
      : [];
  });
}

describe("Reports/SLA production comment hygiene", () => {
  it("does not reintroduce delivery-history labels", () => {
    const source = join(process.cwd(), "src");
    const files = [
      ...productionSources(join(source, "components", "reports")),
      ...productionSources(join(source, "components", "sla")),
      ...productionSources(join(source, "lib", "reports")),
      ...productionSources(join(source, "lib", "sla")),
      join(source, "pages", "reports-page.tsx"),
      join(source, "pages", "sla-page.tsx"),
      ...readdirSync(join(source, "services"))
        .filter((name) => /^(report|sla)/.test(name) && name.endsWith(".ts"))
        .map((name) => join(source, "services", name)),
    ];
    const historicalLabel = /\b(?:paket|package|phase|faza|val)\s+\d|(?:design|plan)\s*§\s*\d/i;
    const violations = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((text, index) => ({ path, line: index + 1, text: text.trim() }))
        .filter(({ text }) => historicalLabel.test(text)),
    );
    expect(violations).toEqual([]);
  });
});
