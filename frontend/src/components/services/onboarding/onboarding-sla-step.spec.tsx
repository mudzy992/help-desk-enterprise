// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingSlaStep } from "@/components/services/onboarding/onboarding-sla-step";
import type { SlaProfile } from "@/services/sla-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const profile = {
  id: "profile-1",
  key: "standard",
  name: "Standard",
  isActive: true,
} as unknown as SlaProfile;

describe("OnboardingSlaStep", () => {
  afterEach(cleanup);

  it("selects the first active profile when profiles arrive after mount", () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <OnboardingSlaStep profiles={[]} selectedId="" isSaving={false} onContinue={onContinue} />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <OnboardingSlaStep
          profiles={[profile]}
          selectedId=""
          isSaving={false}
          onContinue={onContinue}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "services.onboarding.next" }));

    expect(onContinue).toHaveBeenCalledWith("profile-1");
  });
});
