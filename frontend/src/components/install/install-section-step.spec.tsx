// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallSectionStep } from "@/components/install/install-section-step";
import { ApiError } from "@/services/api";
import {
  loadInstallSection,
  saveInstallSection,
  type InstallSettingsSectionStatus,
} from "@/services/install-sections-api";

// Radix' Switch measures itself; jsdom has no ResizeObserver to do it with.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-sections-api", () => ({
  loadInstallSection: vi.fn(),
  saveInstallSection: vi.fn(),
}));

/*
  F5: one screen for all eleven sections of the Full package. What the step owns
  is not the fields — those come from the registry — but the three things the
  registry cannot know: which changes go on the wire, what a refusal means, and
  what a missing prerequisite does to the operator.
*/
const onCall: InstallSettingsSectionStatus = {
  sectionKey: "onCall",
  stepKey: "section.onCall",
  titleKey: "install.section.onCall.title",
  answered: false,
  dependencies: [{ dependency: "team", satisfied: false }],
  fields: [
    {
      key: "private.onCall.enabled",
      valueType: "boolean",
      visibility: "private",
      titleKey: "settings.registry.keys.private.onCall.enabled",
      helpKey: "settings.registry.help.private.onCall.enabled",
      description: "Turns on-call schedules on.",
      value: false,
      defaultValue: false,
      isSet: true,
      isRequired: false,
      group: null,
      definitionRequires: [],
    },
    {
      key: "private.onCall.reminderTime",
      valueType: "string",
      visibility: "private",
      titleKey: "settings.registry.keys.private.onCall.reminderTime",
      helpKey: "settings.registry.help.private.onCall.reminderTime",
      description: "When the reminder goes out.",
      value: "08:00",
      defaultValue: "08:00",
      isSet: true,
      isRequired: false,
      group: null,
      definitionRequires: [],
    },
    {
      key: "private.security.auditWebhook.secret",
      valueType: "string",
      visibility: "secret",
      titleKey: "settings.registry.keys.private.security.auditWebhook.secret",
      helpKey: "settings.registry.help.private.security.auditWebhook.secret",
      description: "Signs every webhook message.",
      value: "[REDACTED]",
      defaultValue: null,
      isSet: true,
      isRequired: false,
      group: null,
      definitionRequires: [],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.mocked(loadInstallSection).mockReset();
  vi.mocked(saveInstallSection).mockReset();
});

describe("InstallSectionStep", () => {
  it("loads the section it is given and renders the registry fields", async () => {
    vi.mocked(loadInstallSection).mockResolvedValue(onCall);

    render(<InstallSectionStep sectionKey="onCall" />);

    await waitFor(() => expect(screen.getAllByRole("switch")).toHaveLength(1));
    expect(vi.mocked(loadInstallSection)).toHaveBeenCalledWith("onCall");
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByPlaceholderText("install.section.secretSet")).toBeTruthy();
  });

  it("sends only the fields the operator changed", async () => {
    vi.mocked(loadInstallSection).mockResolvedValue(onCall);
    vi.mocked(saveInstallSection).mockResolvedValue({ ...onCall, answered: true });
    const onSaved = vi.fn();

    render(<InstallSectionStep sectionKey="onCall" onSaved={onSaved} />);
    await waitFor(() => expect(screen.getAllByRole("switch")).toHaveLength(1));
    fireEvent.click(screen.getAllByRole("switch")[0]);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "07:30" } });
    fireEvent.submit(screen.getByRole("button"));

    await waitFor(() =>
      expect(vi.mocked(saveInstallSection)).toHaveBeenCalledWith("onCall", [
        { key: "private.onCall.enabled", value: true },
        { key: "private.onCall.reminderTime", value: "07:30" },
      ]),
    );
    expect(onSaved).toHaveBeenCalled();
    await screen.findByText("install.section.saved");
  });

  it("keeps a stored secret when the box stays empty", async () => {
    vi.mocked(loadInstallSection).mockResolvedValue(onCall);
    vi.mocked(saveInstallSection).mockResolvedValue(onCall);

    render(<InstallSectionStep sectionKey="onCall" />);
    await waitFor(() => expect(screen.getAllByRole("switch")).toHaveLength(1));
    fireEvent.submit(screen.getByRole("button"));

    expect(vi.mocked(saveInstallSection)).toHaveBeenCalledWith("onCall", []);
  });

  it("names the missing prerequisite instead of blaming the fields", async () => {
    vi.mocked(loadInstallSection).mockResolvedValue(onCall);

    render(<InstallSectionStep sectionKey="onCall" />);

    await waitFor(() => expect(screen.getByText("install.section.requires.team")).toBeTruthy());
  });

  it("turns a refusal into one readable sentence", async () => {
    vi.mocked(loadInstallSection).mockResolvedValue(onCall);
    vi.mocked(saveInstallSection).mockRejectedValue(
      new ApiError(409, "INSTALL_SETTINGS_SECTION_DEPENDENCY_UNMET", "no team", null, {
        dependencies: ["team"],
      }),
    );

    render(<InstallSectionStep sectionKey="onCall" />);
    await waitFor(() => expect(screen.getAllByRole("switch")).toHaveLength(1));
    fireEvent.click(screen.getAllByRole("switch")[0]);
    fireEvent.submit(screen.getByRole("button"));

    await screen.findByText("install.section.errorDependency");
  });
});
