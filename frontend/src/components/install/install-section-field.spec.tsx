// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallSectionField } from "@/components/install/install-section-field";
import type { InstallSettingsSectionField } from "@/services/install-sections-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/*
  F5 + owner decision 9: the same wizard, two audiences. A field is drawn from the
  definition metadata, never from a per-key screen: boolean is a switch, number a
  number input, a string with `allowedValues` a select, a secret a password box
  that never renders what is stored. „Obavezno“ is a label, not a second rule —
  the registry decides what it accepts.
*/
function field(overrides: Partial<InstallSettingsSectionField> = {}): InstallSettingsSectionField {
  return {
    key: "private.statusPage.enabled",
    valueType: "boolean",
    visibility: "private",
    titleKey: "settings.registry.keys.private.statusPage.enabled",
    helpKey: "settings.registry.help.private.statusPage.enabled",
    description: "Shows the status page.",
    value: false,
    defaultValue: false,
    isSet: true,
    isRequired: false,
    group: null,
    definitionRequires: [],
    ...overrides,
  };
}

afterEach(cleanup);

describe("InstallSectionField", () => {
  it("renders a boolean as a switch that reads its own state", () => {
    const onChange = vi.fn();
    render(<InstallSectionField field={field()} value={false} onChange={onChange} />);

    const control = screen.getByRole("switch");
    expect(control.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders a number as a number input and a string as a text input", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <InstallSectionField
        field={field({
          key: "private.onCall.enabled",
          valueType: "number",
          value: 30,
          defaultValue: 30,
        })}
        value={30}
        onChange={onChange}
      />,
    );
    const number = screen.getByRole("spinbutton");
    expect((number as HTMLInputElement).value).toBe("30");
    fireEvent.change(number, { target: { value: "45" } });
    expect(onChange).toHaveBeenCalledWith(45);
    unmount();

    render(
      <InstallSectionField
        field={field({
          key: "private.inbound.address",
          valueType: "string",
          value: "help@example.com",
        })}
        value="help@example.com"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("renders a key with allowed values as a select, „not set“ included", () => {
    const onChange = vi.fn();
    render(
      <InstallSectionField
        field={field({
          key: "private.inbound.provider",
          valueType: "string",
          value: "imap",
          allowedValues: ["imap", "graph"],
        })}
        value="imap"
        onChange={onChange}
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("imap");
    expect(screen.getByText("install.section.unset")).toBeTruthy();
    fireEvent.change(select, { target: { value: "graph" } });
    expect(onChange).toHaveBeenCalledWith("graph");
    // An emptied control means „leave it as it is“, not „delete the value“.
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("never shows a stored secret, and says what an empty box means", () => {
    const onChange = vi.fn();
    render(
      <InstallSectionField
        field={field({
          key: "private.security.auditWebhook.secret",
          valueType: "string",
          visibility: "secret",
          value: "[REDACTED]",
          isSet: true,
        })}
        value={null}
        onChange={onChange}
      />,
    );

    const input = screen.getByPlaceholderText("install.section.secretSet") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("");
    expect(screen.getByText("install.section.secretHint")).toBeTruthy();
    fireEvent.change(input, { target: { value: "nova-tajna" } });
    expect(onChange).toHaveBeenCalledWith("nova-tajna");
  });

  it("links the definition's own help text to the control (IN11)", () => {
    render(
      <InstallSectionField field={field({ isRequired: true })} value={true} onChange={vi.fn()} />,
    );

    const control = screen.getByRole("switch");
    const ids = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    // The mock carries no dictionary, so the slot falls back to the definition's
    // own sentence — the same thing an operator sees for a key the dictionary does
    // not know yet. What this case pins is the link: the hint travels with the
    // control instead of sitting next to it.
    expect(ids.map((id) => document.getElementById(id)?.textContent).join(" ")).toBe(
      "Shows the status page.",
    );
    expect(screen.getByText(/install\.section\.required/)).toBeTruthy();
  });

  it("disables the control while a save is in flight", () => {
    render(<InstallSectionField field={field()} value={false} onChange={vi.fn()} isDisabled />);
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
  });
});
