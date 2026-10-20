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

describe("On-call/announcements production comment hygiene", () => {
  it("does not reintroduce delivery-history labels", () => {
    const source = join(process.cwd(), "src");
    const files = [
      ...productionSources(join(source, "components", "announcements")),
      ...productionSources(join(source, "components", "on-call")),
      ...productionSources(join(source, "lib", "announcements")),
      ...productionSources(join(source, "lib", "on-call")),
      join(source, "pages", "announcements-page.tsx"),
      join(source, "pages", "on-call-page.tsx"),
    ];
    const historicalLabel = /\b(?:paket|package|phase|faza|val)\s+\d|\bK\d+[a-z]?\b|§\s*\d/i;
    const violations = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((text, index) => ({ path, line: index + 1, text: text.trim() }))
        .filter(({ text }) => historicalLabel.test(text)),
    );
    expect(violations).toEqual([]);
  });
});
