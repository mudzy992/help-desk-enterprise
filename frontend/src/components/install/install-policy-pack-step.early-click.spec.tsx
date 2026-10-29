// @vitest-environment jsdom
import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstallPolicyPackStep } from "@/components/install/install-policy-pack-step";
import { applyInstallPolicyPack, loadInstallPolicyPack } from "@/services/install-content-api";

/*
  The regression this file exists for (CI, 2026-10-16): the step seeded its
  default pack in a `useEffect`, so for one commit the form rendered with
  `selectedKey === null`. A click that arrived in that window hit the handler of
  the *committed* render — the one that bails out — and the wizard silently did
  nothing: "expected spy to be called with `PACK_IT_STANDARD`, number of calls: 0".

  RTL's `act` wrapper hides that window locally (it flushes passive effects before
  the assertion runs), which is why every local run was green while CI was red. So
  this spec deliberately drops the wrapper: it waits for the DOM mutation without
  `act` and clicks immediately, which is exactly the ordering CI hit. The
  component now derives the default from the loaded answer, so the very first
  commit of the form is already submittable.

  `configure` is per module registry, i.e. per spec file, so the rest of the suite
  keeps RTL's usual act wrapping.
*/

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/install-content-api", () => ({
  loadInstallPolicyPack: vi.fn(),
  applyInstallPolicyPack: vi.fn(),
}));

const itStandard = {
  key: "PACK_IT_STANDARD",
  name: "IT Standard",
  description: "Uloge i dozvole za IT service desk",
  defaultClassification: "INTERNAL",
  requiresApproval: false,
  slaProfileKey: "STANDARD_REQUEST",
  grantCount: 12,
};

describe("InstallPolicyPackStep — a click in the first commit", () => {
  it("applies the default pack when the click beats the effects", async () => {
    vi.mocked(loadInstallPolicyPack).mockResolvedValue({
      applied: null,
      blueprint: "itServiceDesk",
      packs: [itStandard],
    });
    vi.mocked(applyInstallPolicyPack).mockResolvedValue({});
    configure({
      asyncWrapper: (callback) => callback(),
      eventWrapper: (callback) => callback(),
    });

    render(<InstallPolicyPackStep />);

    // Polls the DOM without `act`: a MutationObserver callback is a microtask, so
    // it runs before React's passive effects (a scheduler task) — the CI ordering.
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes("IT Standard")) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    expect((screen.getAllByRole("radio")[0] as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByText("install.policyPack.submit"));

    await waitFor(() => expect(applyInstallPolicyPack).toHaveBeenCalledWith("PACK_IT_STANDARD"));
  });
});
