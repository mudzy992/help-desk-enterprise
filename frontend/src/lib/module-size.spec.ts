import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const productionModuleLineLimit = 320;

function sourceFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

describe("lib module boundaries", () => {
  it("keeps production modules below the reviewed complexity ceiling", () => {
    const root = join(process.cwd(), "src", "lib");
    const oversized = sourceFiles(root).flatMap((path) => {
      const lines = readFileSync(path, "utf8").split("\n").length;
      return lines > productionModuleLineLimit
        ? [{ path: relative(root, path), lines, limit: productionModuleLineLimit }]
        : [];
    });

    expect(oversized).toEqual([]);
  });
});
