import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("UI primitive public API", () => {
  it("does not re-export unused Radix passthrough primitives", () => {
    expect(source("./modal.tsx")).not.toMatch(/export const ModalClose\b/);
    expect(source("./sheet.tsx")).not.toMatch(
      /export const (?:SheetClose|SheetPortal|SheetOverlay)\b/,
    );
    expect(source("./dropdown-menu.tsx")).not.toMatch(/export const DropdownMenuGroup\b/);
  });

  it("uses label as the canonical accessible-name prop", () => {
    for (const file of [
      "./avatar.tsx",
      "./progress.tsx",
      "./segmented.tsx",
      "./tabs.tsx",
      "./wizard-stepper.tsx",
    ]) {
      expect(source(file)).not.toContain("ariaLabel");
    }
  });

  it("uses one close translation key across dialog primitives", () => {
    expect(source("./modal.tsx")).toContain('t("ui.close")');
    expect(source("./sheet.tsx")).toContain('t("ui.close")');
    expect(source("./sheet.tsx")).not.toContain('t("shell.close")');
  });
});
