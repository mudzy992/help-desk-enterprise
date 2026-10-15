// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingDetailDialog } from "@/components/settings/setting-detail-dialog";
import type { SettingRegistryEntry } from "@/services/settings-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/services/settings-api", () => ({
  getSettingDependents: vi.fn().mockResolvedValue([]),
}));

/*
  IN18: the install wizard's keys are readable but not editable from the registry
  screen — the wizard rewrites them on its next run, so an editor here would only
  produce a write that disappears. The spec pins both halves: the read-only note
  replaces the editor, and an ordinary key keeps its editor.
*/

function entry(overrides: Partial<SettingRegistryEntry> = {}): SettingRegistryEntry {
  return {
    key: "private.install.profile",
    description: "Package chosen in the install wizard",
    titleKey: "settings.registry.keys.private.install.profile",
    helpKey: "settings.registry.help.private.install.profile",
    group: null,
    requires: [],
    categoryId: "private.install",
    categoryIcon: "wand",
    categoryPriority: 90,
    valueType: "boolean",
    visibility: "private",
    isRequired: false,
    defaultValue: false,
    value: false,
    isSet: false,
    readOnly: true,
    ...overrides,
  };
}

function renderDialog(target: SettingRegistryEntry) {
  render(
    <SettingDetailDialog
      open
      onOpenChange={() => {}}
      entry={target}
      entries={[target]}
      canWrite
      pending={false}
      onSave={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingDetailDialog (IN18)", () => {
  it("explains why a wizard-owned key cannot be edited here", () => {
    renderDialog(entry());

    expect(screen.getByTestId("setting-detail-readonly")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "private.install.profile" })).toHaveProperty(
      "disabled",
      true,
    );
    // No reason field and no save path: nothing to submit.
    expect(screen.queryByTestId("setting-detail-reason")).toBeNull();
  });

  it("keeps the editor for a key the settings screen owns", () => {
    renderDialog(
      entry({
        key: "private.auth.mfa.requiredForAdmins",
        readOnly: false,
        titleKey: "settings.registry.keys.private.auth.mfa.requiredForAdmins",
      }),
    );

    expect(screen.queryByTestId("setting-detail-readonly")).toBeNull();
    const control = screen.getByRole("switch", {
      name: "private.auth.mfa.requiredForAdmins",
    });
    expect(control).toHaveProperty("disabled", false);

    fireEvent.click(control);
    expect(screen.getByTestId("setting-detail-reason")).toBeTruthy();
  });
});
