// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallSmtpTestPanel } from "@/components/install/install-smtp-test-panel";
import { ApiError } from "@/services/api";
import { sendInstallSmtpTest } from "@/services/install-content-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-content-api", () => ({
  sendInstallSmtpTest: vi.fn(),
}));

/*
  F4.1: the operator tests the mail path before the wizard closes. Three things
  have to hold: a green answer names the address it used, a refusal says what to do
  about it, and the button is dead while the form still has unsaved edits — the
  endpoint only knows the stored settings.
*/
describe("InstallSmtpTestPanel", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(sendInstallSmtpTest).mockReset();
  });

  it("reports the address the test was sent to", async () => {
    vi.mocked(sendInstallSmtpTest).mockResolvedValue({
      isSent: true,
      toAddress: "admin@example.com",
    });

    render(<InstallSmtpTestPanel isConfigured hasUnsavedChanges={false} />);

    fireEvent.click(screen.getByText("install.smtp.test.send"));

    expect(await screen.findByText("install.smtp.test.sent")).toBeTruthy();
    expect(sendInstallSmtpTest).toHaveBeenCalledWith(undefined);
  });

  it("turns a refused login into the sentence for it", async () => {
    vi.mocked(sendInstallSmtpTest).mockRejectedValue(
      new ApiError(400, "SMTP_TEST_AUTH_FAILED", "535"),
    );

    render(<InstallSmtpTestPanel isConfigured hasUnsavedChanges={false} />);

    fireEvent.click(screen.getByText("install.smtp.test.send"));

    expect(await screen.findByText("install.smtp.test.errorAuth")).toBeTruthy();
  });

  it("cannot be used before SMTP is saved", () => {
    render(<InstallSmtpTestPanel isConfigured={false} hasUnsavedChanges={false} />);

    expect(screen.getByText("install.smtp.test.send").closest("button")?.disabled).toBe(true);
    expect(screen.getByText("install.smtp.test.errorNotConfigured")).toBeTruthy();
  });

  it("waits for the operator to save their edits", () => {
    render(<InstallSmtpTestPanel isConfigured hasUnsavedChanges />);

    expect(screen.getByText("install.smtp.test.send").closest("button")?.disabled).toBe(true);
    expect(screen.getByText("install.smtp.test.savingFirst")).toBeTruthy();
  });
});
