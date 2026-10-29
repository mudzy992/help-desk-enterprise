// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallAddonsStep } from "@/components/install/install-addons-step";
import { loadInstallAddons, saveInstallAddons } from "@/services/install-addons-api";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-addons-api", () => ({
  loadInstallAddons: vi.fn(),
  saveInstallAddons: vi.fn(),
}));

/*
  F4.5: the step has to read like a product, not like the settings catalog — the
  operator sees a named card per add-on, grouped by what it is good for, and the
  e-mail card explains itself when SMTP is not there yet.
*/
const record = {
  smtpEnabled: false,
  items: [
    { key: "csat", enabled: true, defaultEnabled: true, canEnable: true },
    { key: "cmdb", enabled: false, defaultEnabled: false, canEnable: true },
    { key: "email", enabled: false, defaultEnabled: false, canEnable: false },
    { key: "somethingNew", enabled: false, defaultEnabled: false, canEnable: true },
  ],
};

describe("InstallAddonsStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallAddons).mockReset();
    vi.mocked(saveInstallAddons).mockReset();
  });

  it("groups the add-ons and names them by what they do", async () => {
    vi.mocked(loadInstallAddons).mockResolvedValue({ addons: record });

    render(<InstallAddonsStep />);

    expect(await screen.findByText("install.addons.category.serviceQuality")).toBeTruthy();
    expect(screen.getByText("install.addons.csat.title")).toBeTruthy();
    expect(screen.getByText("install.addons.csat.value")).toBeTruthy();
    expect(screen.getByText("install.addons.category.itsm")).toBeTruthy();
    expect(screen.getByText("install.addons.cmdb.title")).toBeTruthy();
  });

  it("says why the e-mail add-on cannot be switched on", async () => {
    vi.mocked(loadInstallAddons).mockResolvedValue({ addons: record });

    render(<InstallAddonsStep />);

    expect(await screen.findByText("install.addons.emailDisabledHint")).toBeTruthy();
    // Card order follows the fixture: csat, cmdb, email, then the unknown one.
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(4);
    expect(switches[2]?.hasAttribute("disabled")).toBe(true);
    expect(switches[0]?.hasAttribute("disabled")).toBe(false);
  });

  it("shows an add-on it has no copy for instead of hiding it", async () => {
    vi.mocked(loadInstallAddons).mockResolvedValue({ addons: record });

    render(<InstallAddonsStep />);

    expect(await screen.findByText("install.addons.other")).toBeTruthy();
    expect(screen.getByText("somethingNew")).toBeTruthy();
  });

  it("saves the switches as they are on screen", async () => {
    vi.mocked(loadInstallAddons).mockResolvedValue({ addons: record });
    vi.mocked(saveInstallAddons).mockResolvedValue(record);
    const onSaved = vi.fn();

    render(<InstallAddonsStep onSaved={onSaved} />);

    const switches = await screen.findAllByRole("switch");
    fireEvent.click(switches[1]!);
    fireEvent.click(screen.getByText("install.addons.submit"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(saveInstallAddons).toHaveBeenCalledWith({
      addons: { csat: true, cmdb: true, email: false, somethingNew: false },
    });
  });
});
