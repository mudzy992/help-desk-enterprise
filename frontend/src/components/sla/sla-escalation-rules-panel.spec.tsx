// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlaEscalationRulesPanel } from "@/components/sla/sla-escalation-rules-panel";
import { ApiError } from "@/services/api";
import { listSlaEscalationRules } from "@/services/sla-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { requestId?: string }) => values?.requestId ?? key,
  }),
}));
vi.mock("@/components/sla/sla-escalation-rule-form", () => ({
  SlaEscalationRuleForm: () => null,
}));
vi.mock("@/components/sla/sla-escalation-rules-table", () => ({
  SlaEscalationRulesTable: () => <div>rules</div>,
}));
vi.mock("@/lib/sla/use-sla-escalation-group-names", () => ({
  useSlaEscalationGroupNames: () => new Map(),
}));
vi.mock("@/services/sla-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/sla-api")>()),
  listSlaEscalationRules: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("SlaEscalationRulesPanel recovery", () => {
  it("shows request correlation and retries the active profile", async () => {
    vi.mocked(listSlaEscalationRules)
      .mockRejectedValueOnce(new ApiError(503, "UNAVAILABLE", "failed", "req-escalations"))
      .mockResolvedValueOnce([]);
    render(<SlaEscalationRulesPanel slaProfileId="profile-1" embedded />);

    expect(await screen.findByText("req-escalations")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ui.retry" }));
    await waitFor(() => expect(listSlaEscalationRules).toHaveBeenCalledTimes(2));
    expect(listSlaEscalationRules).toHaveBeenLastCalledWith("profile-1");
  });
});
