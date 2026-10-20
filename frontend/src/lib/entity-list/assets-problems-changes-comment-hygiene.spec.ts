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

describe("Assets/Problems/Changes comment hygiene", () => {
  it("does not reintroduce delivery package or numbered section labels", () => {
    const sourceRoot = join(process.cwd(), "src");
    const files = [
      ...productionSources(join(sourceRoot, "components", "assets")),
      ...productionSources(join(sourceRoot, "components", "problems")),
      ...productionSources(join(sourceRoot, "components", "changes")),
      ...productionSources(join(sourceRoot, "lib", "assets")),
      ...productionSources(join(sourceRoot, "lib", "problems")),
      ...productionSources(join(sourceRoot, "lib", "changes")),
      ...[
        "assets",
        "asset-detail",
        "my-assets",
        "problems",
        "problem-detail",
        "changes",
        "change-detail",
      ].map((name) => join(sourceRoot, "pages", `${name}-page.tsx`)),
      ...["assets-api", "problems-api", "changes-api", "asset-transfers-api"].map((name) =>
        join(sourceRoot, "services", `${name}.ts`),
      ),
    ];
    const historicalLabel = /\bpaket\s+\d|§\s*\d/i;
    const violations = files.flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((text, index) => ({ path, line: index + 1, text: text.trim() }))
        .filter(({ text }) => historicalLabel.test(text)),
    );
    expect(violations).toEqual([]);
  });
});
