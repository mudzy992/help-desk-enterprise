import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Thresholds = {
  readonly owner: string;
  readonly reviewBy: string;
  readonly builds: {
    readonly production: { readonly buildKind: string; readonly reactCommitsRequired: boolean };
    readonly reactProfiling: {
      readonly buildKind: string;
      readonly reactCommitsRequired: boolean;
      readonly maxCommits: number;
      readonly maxTotalCommitDurationMs: number;
      readonly maxSingleCommitDurationMs: number;
    };
  };
  readonly scenarios: readonly {
    readonly key: string;
    readonly path: string;
    readonly fixtureCardinality: Readonly<Record<string, number>>;
  }[];
};

const frontendRoot = resolve(import.meta.dirname, "../../..");
const repositoryRoot = resolve(frontendRoot, "..");

const source = (path: string) => readFileSync(resolve(frontendRoot, path), "utf8");

describe("isolated React profiling build contract", () => {
  const thresholds = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "docs/frontend/quality/performance-thresholds.json"),
      "utf8",
    ),
  ) as Thresholds;

  it("keeps profiling aliases behind the dedicated Vite mode", () => {
    const viteConfig = source("vite.config.ts");
    const packageJson = JSON.parse(source("package.json")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(packageJson.scripts["build:profiling"]).toContain("--mode react-profiling");
    expect(packageJson.scripts.build).not.toContain("react-profiling");
    expect(viteConfig).toContain('mode === "react-profiling"');
    expect(viteConfig).toContain("react-dom/profiling");
  });

  it("separates production long-task evidence from React commit evidence", () => {
    expect(thresholds.builds.production).toMatchObject({
      buildKind: "production",
      reactCommitsRequired: false,
    });
    expect(thresholds.builds.reactProfiling).toMatchObject({
      buildKind: "react-profiling",
      reactCommitsRequired: true,
    });
    expect(thresholds.builds.reactProfiling.maxCommits).toBeGreaterThan(0);
    expect(thresholds.builds.reactProfiling.maxTotalCommitDurationMs).toBeGreaterThan(0);
    expect(thresholds.builds.reactProfiling.maxSingleCommitDurationMs).toBeGreaterThan(0);
  });

  it("locks owner, review date, profile opt-in and fixture cardinality", () => {
    expect(thresholds.owner).not.toBe("");
    expect(Number.isNaN(Date.parse(thresholds.reviewBy))).toBe(false);
    expect(thresholds.scenarios.map((scenario) => scenario.key)).toEqual([
      "dashboard",
      "ticket-list",
      "ticket-inbox",
      "ticket-detail",
      "assets",
      "service-catalog",
    ]);
    for (const scenario of thresholds.scenarios) {
      expect(scenario.path).toContain("profile=1");
      expect(Object.values(scenario.fixtureCardinality).every((count) => count > 0)).toBe(true);
    }
  });
});
