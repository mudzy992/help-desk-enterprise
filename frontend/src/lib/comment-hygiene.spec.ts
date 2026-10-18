import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

function productionSourceFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

describe("lib comment hygiene", () => {
  it("does not reintroduce project-phase labels into production comments", () => {
    const phaseWords = ["paket", "phase", "faza", "review"].join("|");
    const historicalLabel = new RegExp(
      `\\b(?:${phaseWords})\\s+\\d|\\((?:T|M|B|F|K|A)\\d`,
      "i",
    );
    const root = join(process.cwd(), "src", "lib");
    const violations = productionSourceFiles(root).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ path, line: index + 1, text: line.trim() }))
        .filter(({ text }) => historicalLabel.test(text)),
    );

    expect(violations).toEqual([]);
  });
});
