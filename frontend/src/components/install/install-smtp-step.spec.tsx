// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallSmtpStep } from "@/components/install/install-smtp-step";
import { ApiError } from "@/services/api";
import { loadInstallSmtp } from "@/services/install-smtp-api";

// The Pulse `Switch` is a Radix primitive; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-smtp-api", () => ({
  loadInstallSmtp: vi.fn(),
  saveInstallSmtp: vi.fn(),
}));

const storedRecord = {
  isConfigured: true,
  enabled: true,
  host: "smtp.example.com",
  port: 587,
  tls: true,
  username: "mailer",
  fromAddress: "helpdesk@example.com",
  passwordConfigured: true,
  emailAddonEnabled: true,
};

/*
  F0.2 (IN3): the SMTP step is the sharpest case in the wizard — with the old
  code a failed load left `enabled: false` in the form, and one click saved that
  over a working mail configuration.
*/
describe("InstallSmtpStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallSmtp).mockReset();
  });

  it("never renders the form when the stored state could not be read", async () => {
    vi.mocked(loadInstallSmtp).mockRejectedValue(
      new ApiError(503, "SETUP_DATABASE_UNAVAILABLE", "down", "req-7"),
    );

    render(<InstallSmtpStep />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("install.stepLoadError");
    // No form at all: no field, no submit button.
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "install.smtp.submit" })).toBeNull();
  });

  it("shows the stored configuration once the load succeeds", async () => {
    vi.mocked(loadInstallSmtp).mockResolvedValue({ smtp: storedRecord });

    render(<InstallSmtpStep />);

    expect(await screen.findByDisplayValue("smtp.example.com")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("install.smtp.host")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
