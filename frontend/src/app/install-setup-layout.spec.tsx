// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallSetupProvider } from "@/app/install-setup-provider";
import { InstallSetupLayout } from "@/app/install-setup-layout";
import { loadInstallSetupStatus } from "@/services/install-api";
import { loadInstallReadiness } from "@/services/install-profile-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/install-api", () => ({
  loadInstallSetupStatus: vi.fn(),
}));

// F1: the provider also reads readiness; here it is only a field on the context.
vi.mock("@/services/install-profile-api", () => ({
  loadInstallReadiness: vi.fn(),
}));

function CurrentPath() {
  const location = useLocation();
  return <p data-testid="current-path">{location.pathname}</p>;
}

function renderGate(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <InstallSetupProvider>
        <Routes>
          <Route element={<InstallSetupLayout />}>
            <Route path="*" element={<p>application</p>} />
            <Route path="/install" element={<p>wizard</p>} />
            <Route path="/login" element={<p>login</p>} />
          </Route>
        </Routes>
        <CurrentPath />
      </InstallSetupProvider>
    </MemoryRouter>,
  );
}

describe("InstallSetupLayout", () => {
  beforeEach(() => {
    // F1: the provider reads readiness alongside the status; here it only has to
    // answer so the gate can be exercised.
    vi.mocked(loadInstallReadiness).mockResolvedValue({ isReady: false, checks: [] });
  });

  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallSetupStatus).mockReset();
    vi.mocked(loadInstallReadiness).mockReset();
  });

  it("does not send the user to the wizard when the status request fails", async () => {
    vi.mocked(loadInstallSetupStatus).mockRejectedValue(new Error("network"));

    renderGate("/tickets");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("current-path").textContent).toBe("/tickets");
  });

  it("retries the status request from the error screen", async () => {
    vi.mocked(loadInstallSetupStatus)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ isCompleted: true });

    renderGate("/login");

    fireEvent.click(await screen.findByRole("button", { name: "install.statusError.retry" }));

    expect(await screen.findByText("login")).toBeTruthy();
    expect(loadInstallSetupStatus).toHaveBeenCalledTimes(2);
  });

  it("redirects to the wizard when the installation is not completed", async () => {
    vi.mocked(loadInstallSetupStatus).mockResolvedValue({ isCompleted: false });

    renderGate("/tickets");

    await waitFor(() => expect(screen.getByTestId("current-path").textContent).toBe("/install"));
  });
});
