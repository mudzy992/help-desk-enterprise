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

describe("ticket production comment hygiene", () => {
  it("does not reintroduce implementation-phase labels", () => {
    const ticketRoots = [
      join(process.cwd(), "src", "components", "tickets"),
      join(process.cwd(), "src", "lib", "tickets"),
    ];
    const directFiles = [
      join(process.cwd(), "src", "pages", "ticket-list-page.tsx"),
      join(process.cwd(), "src", "pages", "ticket-detail-page.tsx"),
    ];
    const serviceRoot = join(process.cwd(), "src", "services");
    const serviceFiles = readdirSync(serviceRoot)
      .filter((name) => name.startsWith("ticket") && name.endsWith(".ts"))
      .map((name) => join(serviceRoot, name));
    const historicalLabel = /\b(?:paket|package|phase|faza|val)\s+\d|\bM\d+\s+(?:[A-Z]\d+|#\d+)\b/i;
    const violations = [
      ...ticketRoots.flatMap(sourceFiles),
      ...directFiles,
      ...serviceFiles,
    ].flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ path, line: index + 1, text: line.trim() }))
        .filter(({ text }) => historicalLabel.test(text)),
    );

    expect(violations).toEqual([]);
  });
});
