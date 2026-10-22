import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ExceptionRegistry = {
  readonly records: readonly {
    readonly ecosystem: "frontend" | "backend" | "e2e";
    readonly scope: "production" | "development";
    readonly package: string;
    readonly severity: "low" | "moderate" | "high" | "critical";
    readonly advisories: readonly { readonly id: string; readonly url: string }[];
    readonly reason: string;
    readonly owner: string;
    readonly targetDate: string;
  }[];
};

const frontendRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(frontendRoot, "..");
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, "package.json"), "utf8")) as {
  readonly engines: { readonly node: string };
  readonly devDependencies: Readonly<Record<string, string>>;
};
const exceptions = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "docs/frontend/quality/dependency-advisory-exceptions.json"),
    "utf8",
  ),
) as ExceptionRegistry;

describe("dependency hygiene contract", () => {
  it("locks the security-upgraded frontend toolchain and its Node runtime", () => {
    expect(packageJson.engines.node).toBe(">=22");
    expect(packageJson.devDependencies.vite).toMatch(/^\^8\./);
    expect(packageJson.devDependencies.vitest).toMatch(/^\^5\./);
    expect(packageJson.devDependencies["@vitejs/plugin-react"]).toMatch(/^\^6\./);
  });

  it("allows no accepted high or critical production exception", () => {
    expect(
      exceptions.records.filter(
        (record) =>
          record.scope === "production" &&
          (record.severity === "high" || record.severity === "critical"),
      ),
    ).toEqual([]);
  });

  it("requires every remaining advisory to have traceability and a review deadline", () => {
    expect(exceptions.records.length).toBeGreaterThan(0);
    for (const record of exceptions.records) {
      expect(record.package).not.toBe("");
      expect(record.advisories.length).toBeGreaterThan(0);
      expect(record.advisories.every((advisory) => advisory.id.startsWith("GHSA-"))).toBe(true);
      expect(record.reason).not.toBe("");
      expect(record.owner).not.toBe("");
      expect(Number.isNaN(Date.parse(record.targetDate))).toBe(false);
    }
  });
});
