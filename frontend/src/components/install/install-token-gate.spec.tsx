// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallTokenGate } from "@/components/install/install-token-gate";
import { readInstallToken } from "@/lib/install/install-token-store";
import { ApiError } from "@/services/api";
import { loadInstallSuperAdmin } from "@/services/install-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-api", () => ({
  loadInstallSuperAdmin: vi.fn(),
}));

/*
  F0.1 (IN2) + audit 11: the gate used to unlock on *any* error it did not
  recognise — a network failure, a 5xx or a timeout opened the wizard with an
  unverified token, and the token was written to the tab before it was checked.
  These specs pin the fail-closed behaviour.
*/
describe("InstallTokenGate", () => {
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    vi.mocked(loadInstallSuperAdmin).mockReset();
  });

  function renderGate() {
    return render(
      <InstallTokenGate>
        <p>wizard</p>
      </InstallTokenGate>,
    );
  }

  function typeToken(value: string) {
    fireEvent.change(screen.getByLabelText("install.tokenLabel"), { target: { value } });
  }

  it("unlocks only after the token was verified and persists it afterwards", async () => {
    vi.mocked(loadInstallSuperAdmin).mockResolvedValue({ superAdmin: null });
    renderGate();

    expect(screen.queryByText("wizard")).toBeNull();
    typeToken("secret-token");

    fireEvent.click(screen.getByRole("button", { name: "install.tokenSubmit" }));

    expect(await screen.findByText("wizard")).toBeTruthy();
    expect(loadInstallSuperAdmin).toHaveBeenCalledWith("secret-token");
    expect(readInstallToken()).toBe("secret-token");
  });

  it("keeps a rejected token out of the tab", async () => {
    vi.mocked(loadInstallSuperAdmin).mockRejectedValue(
      new ApiError(403, "INSTALL_TOKEN_INVALID", "invalid"),
    );
    renderGate();

    typeToken("wrong-token");
    fireEvent.click(screen.getByRole("button", { name: "install.tokenSubmit" }));

    expect(await screen.findByText("install.tokenInvalid")).toBeTruthy();
    expect(screen.queryByText("wizard")).toBeNull();
    expect(readInstallToken()).toBeNull();
  });

  it("stays locked when the server cannot answer, and retries", async () => {
    vi.mocked(loadInstallSuperAdmin)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ superAdmin: null });
    renderGate();

    typeToken("secret-token");
    fireEvent.click(screen.getByRole("button", { name: "install.tokenSubmit" }));

    expect(await screen.findByText("install.tokenUnavailable")).toBeTruthy();
    expect(screen.queryByText("wizard")).toBeNull();
    expect(readInstallToken()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "install.retry" }));

    expect(await screen.findByText("wizard")).toBeTruthy();
    expect(readInstallToken()).toBe("secret-token");
  });

  it("re-checks a stored token on mount instead of trusting it", async () => {
    window.sessionStorage.setItem("helpdesk.installToken", "stale-token");
    vi.mocked(loadInstallSuperAdmin).mockRejectedValue(
      new ApiError(403, "INSTALL_TOKEN_INVALID", "invalid"),
    );
    renderGate();

    expect(await screen.findByText("install.tokenInvalid")).toBeTruthy();
    await waitFor(() => expect(readInstallToken()).toBeNull());
    expect(screen.queryByText("wizard")).toBeNull();
  });

  it("opens on mount when the stored token is still good", async () => {
    window.sessionStorage.setItem("helpdesk.installToken", "saved-token");
    vi.mocked(loadInstallSuperAdmin).mockResolvedValue({ superAdmin: null });
    renderGate();

    expect(await screen.findByText("wizard")).toBeTruthy();
    expect(loadInstallSuperAdmin).toHaveBeenCalledWith("saved-token");
  });
});
