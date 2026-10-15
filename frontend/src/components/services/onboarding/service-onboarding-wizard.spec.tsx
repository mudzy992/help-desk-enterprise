// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceOnboardingWizard } from "@/components/services/onboarding/service-onboarding-wizard";
import {
  completeOnboardingStep,
  createServiceOnboarding,
  saveOnboardingServiceStep,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/services/onboarding/service-onboarding-stepper", () => ({
  ServiceOnboardingStepper: () => <div>stepper</div>,
}));
vi.mock("@/components/ui/scroll-region", () => ({
  ScrollRegion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/services/onboarding/onboarding-wizard-steps", () => ({
  OnboardingWizardSteps: ({ onService }: { onService: (values: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onService({
          name: "E2E service",
          slug: "e2e-service",
          categoryId: "category-1",
          requiresApproval: false,
        })
      }
    >
      save service step
    </button>
  ),
}));
vi.mock("@/services/service-onboarding-api", () => ({
  SERVICE_ONBOARDING_STEPS: ["SERVICE", "FORM", "ROUTING", "SLA", "APPROVALS"],
  createServiceOnboarding: vi.fn(),
  saveOnboardingServiceStep: vi.fn(),
  completeOnboardingStep: vi.fn(),
  abandonServiceOnboarding: vi.fn(),
  finalizeServiceOnboarding: vi.fn(),
  saveOnboardingApprovalsStep: vi.fn(),
  saveOnboardingFormStep: vi.fn(),
  saveOnboardingRoutingStep: vi.fn(),
  saveOnboardingSlaStep: vi.fn(),
}));
vi.mock("@/services/service-catalog-api", () => ({
  getService: vi.fn(async () => ({ id: "service-1" })),
}));
vi.mock("@/services/sla-api", () => ({
  listSlaProfiles: vi.fn(async () => []),
}));

const created: ServiceOnboardingResponse = {
  id: "onboarding-1",
  serviceId: "service-1",
  status: "IN_PROGRESS",
  currentStep: "SERVICE",
  completedSteps: [],
  formVersionRef: null,
  routingConfigurationRef: null,
  slaConfigurationRef: null,
  approvalsConfigurationRef: null,
  routingSuggestion: null,
  lastValidationErrors: [],
  serviceLifecycle: "DRAFT",
  warnings: [],
  createdAt: "2026-10-15T00:00:00.000Z",
  updatedAt: "2026-10-15T00:00:00.000Z",
};

describe("ServiceOnboardingWizard recovery", () => {
  beforeEach(() => {
    vi.mocked(createServiceOnboarding).mockReset().mockResolvedValue(created);
    vi.mocked(saveOnboardingServiceStep)
      .mockReset()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue(created);
    vi.mocked(completeOnboardingStep)
      .mockReset()
      .mockResolvedValue({
        ...created,
        currentStep: "FORM",
        completedSteps: ["SERVICE"],
      });
  });

  afterEach(cleanup);

  it("keeps the step visible and retries the created service without creating a duplicate", async () => {
    render(
      <ServiceOnboardingWizard
        serviceId={null}
        categories={[]}
        canWriteForms
        onClose={vi.fn()}
        onFinished={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "save service step" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "save service step" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "save service step" }));
    await waitFor(() => expect(saveOnboardingServiceStep).toHaveBeenCalledTimes(2));
    expect(createServiceOnboarding).toHaveBeenCalledTimes(1);
  });
});
