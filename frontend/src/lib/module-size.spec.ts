import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const libLineLimit = 320;
const applicationLineLimit = 500;
const legacyHotspotCeilings: Readonly<Record<string, number>> = {
  "pages/asset-detail-page.tsx": 732,
  "pages/announcements-page.tsx": 575,
  "pages/playbook-editor-page.tsx": 573,
  "pages/account-notifications-page.tsx": 540,
  "pages/changes-page.tsx": 522,
  "pages/problems-page.tsx": 521,
  "pages/response-template-editor-page.tsx": 520,
  "pages/login-page.tsx": 519,
  "pages/templates-page.tsx": 518,
  "components/assets/asset-import-panel.tsx": 575,
  "components/announcements/announcement-editor-dialog.tsx": 550,
  "services/problems-api.ts": 578,
  "services/changes-api.ts": 514,
};

function sourceFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name)) || entry.name.includes(".spec.")) return [];
    return [path];
  });
}

function lineCount(path: string): number {
  return readFileSync(path, "utf8").trimEnd().split("\n").length;
}

describe("production module boundaries", () => {
  it("keeps lib modules below the strict complexity ceiling", () => {
    const root = join(process.cwd(), "src", "lib");
    const oversized = sourceFiles(root).flatMap((path) => {
      const lines = lineCount(path);
      return lines > libLineLimit
        ? [{ path: relative(root, path), lines, limit: libLineLimit }]
        : [];
    });
    expect(oversized).toEqual([]);
  });

  it("blocks new oversized pages, components and services while containing legacy hotspots", () => {
    const sourceRoot = join(process.cwd(), "src");
    const roots = ["pages", "components", "services"];
    const violations = roots.flatMap((name) =>
      sourceFiles(join(sourceRoot, name)).flatMap((path) => {
        const modulePath = relative(sourceRoot, path);
        const lines = lineCount(path);
        const limit = legacyHotspotCeilings[modulePath] ?? applicationLineLimit;
        return lines > limit ? [{ path: modulePath, lines, limit }] : [];
      }),
    );
    expect(violations).toEqual([]);
  });

  it("keeps every Phase 8 hotspot below the new 500-line ceiling", () => {
    const sourceRoot = join(process.cwd(), "src");
    const phaseEightHotspots = [
      "services/assets-api.ts",
      "components/assets/asset-catalog-manager.tsx",
      "components/assets/asset-licenses-panel.tsx",
      "components/assets/asset-contracts-panel.tsx",
      "pages/assets-page.tsx",
      "components/reports/trends/report-trends-panel.tsx",
      "components/reports/schedules/report-schedules-panel.tsx",
      "components/privacy/privacy-requests-panel.tsx",
      "components/privacy/privacy-anonymization-panel.tsx",
      "pages/on-call-page.tsx",
      "components/changes/change-form-sheet.tsx",
      "pages/change-detail-page.tsx",
    ];
    expect(
      phaseEightHotspots.flatMap((modulePath) => {
        const lines = lineCount(join(sourceRoot, modulePath));
        return lines > applicationLineLimit
          ? [{ path: modulePath, lines, limit: applicationLineLimit }]
          : [];
      }),
    ).toEqual([]);
  });
});
