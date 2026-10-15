// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsRegistryRow } from "@/components/settings/settings-registry-row";
import type { SettingRegistryEntry } from "@/services/settings-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/*
  IN18: a scan of the registry list should tell which rows belong to the install
  wizard before the detail dialog is opened.
*/

function entry(overrides: Partial<SettingRegistryEntry> = {}): SettingRegistryEntry {
  return {
    key: "private.install.steps.smtp.skipped",
    description: 'SMTP step was deferred with "configure later"',
    titleKey: "settings.registry.keys.private.install.steps.smtp.skipped",
    helpKey: "settings.registry.help.private.install.steps.smtp.skipped",
    group: null,
    requires: [],
    categoryId: "private.install",
    categoryIcon: "wand",
    categoryPriority: 90,
    valueType: "boolean",
    visibility: "private",
    isRequired: false,
    defaultValue: false,
    value: true,
    isSet: true,
    ...overrides,
  };
}

afterEach(cleanup);

describe("SettingsRegistryRow (IN18)", () => {
  it("badges a key the install wizard writes", () => {
    render(<SettingsRegistryRow entry={entry({ readOnly: true })} onOpen={() => {}} />);

    expect(
      screen.getByTestId("setting-row-readonly-private.install.steps.smtp.skipped"),
    ).toBeTruthy();
    expect(screen.getByText("settings.registry.readOnly")).toBeTruthy();
  });

  it("leaves an ordinary key without the badge", () => {
    render(
      <SettingsRegistryRow
        entry={entry({ key: "private.smtp.enabled", value: false, isSet: false })}
        onOpen={() => {}}
      />,
    );

    expect(screen.queryByTestId("setting-row-readonly-private.smtp.enabled")).toBeNull();
    expect(screen.queryByText("settings.registry.readOnly")).toBeNull();
  });
});
