import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(frontendRoot, "..");
const registryPath = resolve(repositoryRoot, "docs/frontend/quality/route-evidence-registry.json");

type Registry = {
  readonly schemaVersion: number;
  readonly routes: Readonly<Record<string, readonly string[]>>;
};

function routedPageModules(): readonly string[] {
  const sources = ["src/app/router.tsx", "src/app/protected-route-catalog.tsx"].map((path) =>
    readFileSync(resolve(frontendRoot, path), "utf8"),
  );
  return [
    ...new Set(
      sources.flatMap((source) =>
        [...source.matchAll(/@\/pages\/([a-z0-9-]+)/g)].map((match) => match[1]),
      ),
    ),
  ].sort();
}

describe("route evidence registry", () => {
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;

  it("maps every routed page module exactly once", () => {
    expect(Object.keys(registry.routes).sort()).toEqual(routedPageModules());
  });

  it("points every route to at least one existing deterministic proof", () => {
    const missing = Object.entries(registry.routes).flatMap(([page, evidence]) => {
      if (evidence.length === 0) return [`${page}: no evidence`];
      return evidence
        .filter((path) => !existsSync(resolve(frontendRoot, path)))
        .map((path) => `${page}: ${path}`);
    });
    expect(missing).toEqual([]);
  });

  it("does not use this census guard as its own route proof", () => {
    expect(Object.values(registry.routes).flat()).not.toContain(
      "src/app/route-evidence-registry.spec.ts",
    );
  });
});
