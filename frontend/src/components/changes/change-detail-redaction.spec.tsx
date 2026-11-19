// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextBlock, isRedacted } from "@/components/changes/change-detail-sections";
import type { ChangeDetail } from "@/services/changes-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "bs" },
    t: (key: string) => key,
  }),
}));

function change(redactedFields: readonly string[]) {
  return { redactedFields } as unknown as ChangeDetail;
}

describe("change detail projection (W7.65)", () => {
  afterEach(cleanup);

  it("renders the plan text when the role may read it", () => {
    render(<TextBlock title="Plan" value="Replace the appliance" />);
    expect(screen.getByText("Replace the appliance")).toBeTruthy();
  });

  it("says the field is hidden instead of showing it as empty", () => {
    render(<TextBlock title="Plan" value={null} redacted />);
    expect(screen.getByText("changes.detail.redactedForRole")).toBeTruthy();
    expect(screen.queryByText("changes.detail.notSet")).toBeNull();
  });

  it("still distinguishes a field that was never filled in", () => {
    render(<TextBlock title="Plan" value={null} />);
    expect(screen.getByText("changes.detail.notSet")).toBeTruthy();
  });

  it("reads the withheld fields the API reports", () => {
    expect(isRedacted(change(["assets", "problem"]), "problem")).toBe(true);
    expect(isRedacted(change(["assets", "problem"]), "description")).toBe(false);
  });
});
