// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallPolicyPackStep } from "@/components/install/install-policy-pack-step";
import { ApiError } from "@/services/api";
import { applyInstallPolicyPack, loadInstallPolicyPack } from "@/services/install-content-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-content-api", () => ({
  loadInstallPolicyPack: vi.fn(),
  applyInstallPolicyPack: vi.fn(),
}));

/*
  F4.3: the step shows what the pack grants and applies the chosen one. The spec
  covers the three promises: only offered packs are offered, applying reports the
  pack that was applied, and a pack the deployment switched off comes back as the
  sentence from the map — not as a raw code.
*/
const itStandard = {
  key: "PACK_IT_STANDARD",
  name: "IT Standard",
  description: "Uloge i dozvole za IT service desk",
  defaultClassification: "INTERNAL",
  requiresApproval: false,
  slaProfileKey: "STANDARD_REQUEST",
  grantCount: 12,
};

describe("InstallPolicyPackStep", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(loadInstallPolicyPack).mockReset();
    vi.mocked(applyInstallPolicyPack).mockReset();
  });

  it("describes the offered pack and applies the chosen one", async () => {
    vi.mocked(loadInstallPolicyPack).mockResolvedValue({
      applied: null,
      blueprint: "itServiceDesk",
      packs: [itStandard],
    });
    vi.mocked(applyInstallPolicyPack).mockResolvedValue({});
    const onSaved = vi.fn();

    render(<InstallPolicyPackStep onSaved={onSaved} />);

    expect(await screen.findByText("IT Standard")).toBeTruthy();
    expect(screen.getByText("Uloge i dozvole za IT service desk")).toBeTruthy();
    fireEvent.click(screen.getByText("install.policyPack.submit"));

    await waitFor(() => {
      expect(applyInstallPolicyPack).toHaveBeenCalledWith("PACK_IT_STANDARD");
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("install.policyPack.applied")).toBeTruthy();
  });

  it("says so when the template offers no pack", async () => {
    vi.mocked(loadInstallPolicyPack).mockResolvedValue({
      applied: null,
      blueprint: "itServiceDesk",
      packs: [],
    });

    render(<InstallPolicyPackStep />);

    expect(await screen.findByText("install.policyPack.empty")).toBeTruthy();
  });

  it("turns a disabled pack into the wizard's sentence", async () => {
    vi.mocked(loadInstallPolicyPack).mockResolvedValue({
      applied: null,
      blueprint: null,
      packs: [itStandard],
    });
    vi.mocked(applyInstallPolicyPack).mockRejectedValue(
      new ApiError(409, "PACK_DISABLED", "disabled"),
    );

    render(<InstallPolicyPackStep />);

    fireEvent.click(await screen.findByText("install.policyPack.submit"));

    expect(await screen.findByText("install.policyPack.errorDisabled")).toBeTruthy();
  });
});
