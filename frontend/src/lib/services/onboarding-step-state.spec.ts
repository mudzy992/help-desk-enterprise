import { describe, expect, it } from "vitest";
import {
  canReachOnboardingStep,
  completedOnboardingCount,
} from "@/lib/services/onboarding-step-state";

describe("onboarding-step-state", () => {
  it("counts completed steps in canonical order", () => {
    expect(completedOnboardingCount(["FORM", "SERVICE"])).toBe(2);
  });

  it("allows the next incomplete step and completed ones", () => {
    expect(canReachOnboardingStep(["SERVICE"], "SERVICE")).toBe(true);
    expect(canReachOnboardingStep(["SERVICE"], "FORM")).toBe(true);
    expect(canReachOnboardingStep(["SERVICE"], "ROUTING")).toBe(false);
  });
});
