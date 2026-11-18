// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProblemOwnerIneligibleHint } from "@/components/problems/problem-owner-ineligible-hint";
import { problemOwnerIneligibleKey } from "@/lib/problems/problem-owner-eligibility";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

afterEach(cleanup);

/**
 * W7.33 (BA-problems-15): the detail must name *why* a recorded owner lost the
 * authority — the same reason the alarm counts — and say nothing at all when the
 * owner is fine or the backend did not send a verdict.
 */
describe("owner drift hints", () => {
  it("names every reason and falls back to a generic hint", () => {
    expect(problemOwnerIneligibleKey("inactive")).toBe(
      "problems.detail.ownerIneligibleReasons.inactive",
    );
    expect(problemOwnerIneligibleKey("not_manager")).toBe(
      "problems.detail.ownerIneligibleReasons.not_manager",
    );
    expect(problemOwnerIneligibleKey("not_member")).toBe(
      "problems.detail.ownerIneligibleReasons.not_member",
    );
    expect(problemOwnerIneligibleKey("out_of_scope")).toBe(
      "problems.detail.ownerIneligibleReasons.out_of_scope",
    );
    expect(problemOwnerIneligibleKey(null)).toBe("problems.detail.ownerIneligibleUnknown");
    expect(problemOwnerIneligibleKey(undefined)).toBe("problems.detail.ownerIneligibleUnknown");
  });

  it("shows the reason and the fix next to the owner", () => {
    render(
      <ProblemOwnerIneligibleHint eligibility={{ eligible: false, reason: "out_of_scope" }} />,
    );
    const hint = screen.getByTestId("problem-owner-ineligible");
    expect(hint.textContent).toContain("problems.detail.ownerIneligibleTitle");
    expect(hint.textContent).toContain("problems.detail.ownerIneligibleReasons.out_of_scope");
    expect(hint.textContent).toContain("problems.detail.ownerIneligibleAction");
  });

  it("stays silent for an eligible owner and when no verdict was sent", () => {
    render(<ProblemOwnerIneligibleHint eligibility={{ eligible: true, reason: null }} />);
    expect(screen.queryByTestId("problem-owner-ineligible")).toBeNull();
    cleanup();
    render(<ProblemOwnerIneligibleHint eligibility={null} />);
    expect(screen.queryByTestId("problem-owner-ineligible")).toBeNull();
  });
});
