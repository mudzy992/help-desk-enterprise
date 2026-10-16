// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallProvisioningStep } from "@/components/install/install-provisioning-step";
import { ApiError } from "@/services/api";
import { completeInstallSetup, type InstallSetupStatus } from "@/services/install-api";
import { loadInstallReadiness } from "@/services/install-profile-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-profile-api", () => ({ loadInstallReadiness: vi.fn() }));

vi.mock("@/services/install-api", () => ({ completeInstallSetup: vi.fn() }));

const markCompleted = vi.fn();
const reload = vi.fn();
vi.mock("@/app/install-setup-provider", () => ({
  useInstallSetup: () => ({ markCompleted, reload }),
}));

/*
  F6.1: the provisioning screen is the last thing between the operator and the end
  of the wizard. Four things have to hold: every check is shown with the backend's
  own sentence, a red check that a step can answer offers „Idi na korak“ (and one
  that no step can answer does not), the finish exists only while everything is
  green, and a refusal from the server is shown with the checks it names.
*/
describe("InstallProvisioningStep", () => {
  beforeEach(() => {
    markCompleted.mockReset();
    reload.mockReset();
    vi.mocked(completeInstallSetup).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallReadiness).mockReset();
  });

  it("shows the checks and links a red one to the step that answers it", async () => {
    vi.mocked(loadInstallReadiness).mockResolvedValue({
      isReady: false,
      checks: [
        { key: "service", status: "ok", messageKey: "install.readiness.service", stepKey: "seed" },
        {
          key: "handlerGroup",
          status: "missing",
          messageKey: "install.readiness.handlerGroup",
          stepKey: "team",
        },
        { key: "roles", status: "missing", messageKey: "install.readiness.roles", stepKey: null },
      ],
    });
    const onFixStep = vi.fn();

    render(<InstallProvisioningStep onFixStep={onFixStep} />);

    expect(await screen.findByText("install.readiness.service")).toBeTruthy();
    expect(screen.getByText("install.provisioning.checking")).toBeTruthy();
    expect(screen.queryByText("install.provisioning.allGreen")).toBeNull();
    // Two red checks, but only one of them has a step behind it.
    const buttons = screen.getAllByText("install.provisioning.goToStep");
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onFixStep).toHaveBeenCalledWith("team");
    // A red check never offers the finish: the wizard would only refuse it.
    expect(screen.queryByText("install.provisioning.finish")).toBeNull();
  });

  it("keeps the list in the backend's order and announces changes politely", async () => {
    vi.mocked(loadInstallReadiness).mockResolvedValue({
      isReady: true,
      checks: [
        { key: "superAdmin", status: "ok", messageKey: "install.readiness.superAdmin" },
        { key: "profileSteps", status: "skipped", messageKey: "install.readiness.profileSteps" },
      ],
    });

    render(<InstallProvisioningStep onFixStep={() => undefined} />);

    const list = await screen.findByRole("list");
    expect(list.getAttribute("aria-live")).toBe("polite");
    const lines = [...list.querySelectorAll("li")].map((entry) => entry.textContent);
    expect(lines[0]).toContain("install.readiness.superAdmin");
    expect(lines[1]).toContain("install.readiness.profileSteps");
    // The status is a word for a screen reader, not only an icon colour.
    expect(lines[0]).toContain("install.provisioning.ok");
    expect(lines[1]).toContain("install.provisioning.deferred");
    expect(screen.getByText("install.provisioning.allGreen")).toBeTruthy();
    // A deferred check is not a red one: „Podesi kasnije“ is a decision, not a gap.
    expect(screen.queryByText("install.provisioning.goToStep")).toBeNull();
  });

  it("finishes the installation once everything is green", async () => {
    vi.mocked(loadInstallReadiness).mockResolvedValue({ isReady: true, checks: [] });
    vi.mocked(completeInstallSetup).mockResolvedValue({} as InstallSetupStatus);

    render(<InstallProvisioningStep onFixStep={() => undefined} />);

    fireEvent.click(await screen.findByText("install.provisioning.finish"));

    expect(vi.mocked(completeInstallSetup)).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(markCompleted).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it("shows the refusal with the checks it names and re-reads the state", async () => {
    vi.mocked(loadInstallReadiness).mockResolvedValue({ isReady: true, checks: [] });
    vi.mocked(completeInstallSetup).mockRejectedValue(
      new ApiError(409, "INSTALL_NOT_READY", "not ready", null, { missing: ["service"] }),
    );

    render(<InstallProvisioningStep onFixStep={() => undefined} />);

    fireEvent.click(await screen.findByText("install.provisioning.finish"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("install.complete.notReady");
    expect(alert.textContent).toContain("install.readiness.service");
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(markCompleted).not.toHaveBeenCalled();
    // The wizard state and the checks are re-read, so the screen follows reality.
    expect(vi.mocked(loadInstallReadiness)).toHaveBeenCalledTimes(2);
  });

  it("asks again without leaving the screen", async () => {
    vi.mocked(loadInstallReadiness).mockResolvedValue({ isReady: true, checks: [] });

    render(<InstallProvisioningStep onFixStep={() => undefined} />);

    fireEvent.click(await screen.findByText("install.provisioning.recheck"));
    expect(vi.mocked(loadInstallReadiness)).toHaveBeenCalledTimes(2);
  });

  it("turns a failed read into the shared load error with a retry", async () => {
    vi.mocked(loadInstallReadiness).mockRejectedValue(
      new ApiError(503, "SETUP_REQUIRED", "setup", "req-9"),
    );

    render(<InstallProvisioningStep onFixStep={() => undefined} />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("install.stepLoadError")).toBeTruthy();
    expect(screen.queryByText("install.provisioning.recheck")).toBeNull();
    fireEvent.click(screen.getByText("install.retry"));
    expect(vi.mocked(loadInstallReadiness)).toHaveBeenCalledTimes(2);
  });
});
