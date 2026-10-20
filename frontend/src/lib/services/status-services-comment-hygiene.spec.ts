import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

function productionFiles(path: string): readonly string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return productionFiles(child);
    return [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.includes(".spec.")
      ? [child]
      : [];
  });
}

describe("status and services comment hygiene", () => {
  it("does not reintroduce delivery-history labels into production comments", () => {
    const roots = [
      join(process.cwd(), "src", "components", "status"),
      join(process.cwd(), "src", "components", "services"),
      join(process.cwd(), "src", "lib", "status"),
      join(process.cwd(), "src", "lib", "services"),
    ];
    const historical = /\b(?:paket|faza|phase|val)\s+\d|§\d|\((?:SS|TM|M|B)\d/i;
    const violations = roots.flatMap(productionFiles).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((text, index) => ({ path, line: index + 1, text: text.trim() }))
        .filter(({ text }) => historical.test(text)),
    );
    expect(violations).toEqual([]);
  });
});
