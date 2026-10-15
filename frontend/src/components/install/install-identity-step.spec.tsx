// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallIdentityStep } from "@/components/install/install-identity-step";
import { ApiError } from "@/services/api";
import { loadInstallIdentity, saveInstallIdentity } from "@/services/install-identity-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-identity-api", () => ({
  loadInstallIdentity: vi.fn(),
  saveInstallIdentity: vi.fn(),
}));

const storedIdentity = {
  organizationName: "Gradska uprava Visoko",
  appName: "Portala",
  tagline: "",
  locale: "bs" as const,
  timeZone: "Europe/Sarajevo",
  logoConfigured: false,
  supportEmail: "",
  supportUrl: "",
  isConfigured: true,
};

/**
 * F2: the identity step is the only place the installation gets its name. It
 * must not post an untouched "configure later" field — that would overwrite a
 * value an earlier save already stored.
 */
describe("InstallIdentityStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallIdentity).mockReset();
    vi.mocked(saveInstallIdentity).mockReset();
  });

  it("keeps the form closed while the stored identity cannot be read", async () => {
    vi.mocked(loadInstallIdentity).mockRejectedValue(
      new ApiError(503, "SETUP_DATABASE_UNAVAILABLE", "down", "req-9"),
    );

    render(<InstallIdentityStep />);

    expect((await screen.findByRole("alert")).textContent).toContain("install.stepLoadError");
    expect(document.querySelectorAll("input")).toHaveLength(0);
  });

  it("prefills the stored identity and shows the live preview", async () => {
    vi.mocked(loadInstallIdentity).mockResolvedValue({ identity: storedIdentity });

    render(<InstallIdentityStep />);

    expect(await screen.findByDisplayValue("Gradska uprava Visoko")).toBeTruthy();
    expect(screen.getByText("Portala")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Gradska uprava Visoko"), {
      target: { value: "Općina Ilijaš" },
    });

    await waitFor(() => expect(screen.getByText("Općina Ilijaš")).toBeTruthy());
  });

  it("saves only the fields the operator filled", async () => {
    vi.mocked(loadInstallIdentity).mockResolvedValue({ identity: storedIdentity });
    vi.mocked(saveInstallIdentity).mockResolvedValue({
      ...storedIdentity,
      organizationName: "Općina Ilijaš",
    });
    const onSaved = vi.fn();

    render(<InstallIdentityStep onSaved={onSaved} />);
    const field = await screen.findByDisplayValue("Gradska uprava Visoko");
    fireEvent.change(field, { target: { value: "Općina Ilijaš" } });
    fireEvent.click(screen.getByRole("button", { name: "install.identity.submit" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveInstallIdentity).toHaveBeenCalledWith({
      organizationName: "Općina Ilijaš",
      appName: "Portala",
      locale: "bs",
      timeZone: "Europe/Sarajevo",
    });
  });

  it("refuses an empty organisation name without calling the server", async () => {
    vi.mocked(loadInstallIdentity).mockResolvedValue({
      identity: { ...storedIdentity, organizationName: "" },
    });

    render(<InstallIdentityStep />);
    const field = await screen.findByLabelText("install.identity.organizationName");
    fireEvent.change(field, { target: { value: "   " } });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "install.identity.submit" })).toHaveProperty(
        "disabled",
        true,
      ),
    );
    expect(saveInstallIdentity).not.toHaveBeenCalled();
  });

  it("shows the reason the server gave for a rejected time zone", async () => {
    vi.mocked(loadInstallIdentity).mockResolvedValue({ identity: storedIdentity });
    vi.mocked(saveInstallIdentity).mockRejectedValue(
      new ApiError(400, "INSTALL_IDENTITY_TIME_ZONE_UNKNOWN", "unknown"),
    );

    render(<InstallIdentityStep />);
    fireEvent.click(await screen.findByRole("button", { name: "install.identity.submit" }));

    expect((await screen.findByRole("alert")).textContent).toBe("install.identity.errorTimeZone");
  });
});
