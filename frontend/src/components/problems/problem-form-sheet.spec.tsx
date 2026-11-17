// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemFormSheet } from "@/components/problems/problem-form-sheet";
import { ApiError } from "@/services/api";
import { requestProblemHandoff, updateProblem } from "@/services/problems-api";
import type { ProblemDetail, ProblemOptions } from "@/services/problems-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/problems-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problems-api")>();
  return {
    ...actual,
    createProblemFull: vi.fn(),
    updateProblem: vi.fn(),
    requestProblemHandoff: vi.fn(),
    searchProblemOwners: vi.fn(async () => ({ items: [] })),
  };
});

const update = vi.mocked(updateProblem);
const handoff = vi.mocked(requestProblemHandoff);

const options: ProblemOptions = {
  units: [
    { id: "ou1", name: "Jedinica A", path: "/root/ou1" },
    { id: "ou2", name: "Jedinica B", path: "/root/ou2" },
  ],
  services: [],
  groups: [
    { id: "g1", name: "Grupa A" },
    { id: "g2", name: "Grupa B" },
  ],
  rootCauseCategories: ["SW"],
  homeOrganizationalUnitId: "ou1",
};

const problem = {
  id: "p1",
  title: "Štampač ne radi",
  description: "Opis kvara",
  impact: "MEDIUM",
  urgency: "MEDIUM",
  version: 7,
  status: "INVESTIGATING",
  group: { id: "g1", name: "Grupa A" },
  organizationalUnit: { id: "ou1", name: "Jedinica A", ouPath: "/root/ou1" },
  service: null,
  owner: null,
  handoff: null,
  permissions: {
    canManage: true,
    canClose: true,
    canClaim: false,
    canLink: true,
    canHandoff: true,
    canDecideHandoff: true,
    canCancelHandoff: true,
  },
} as unknown as ProblemDetail;

function renderSheet(onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemFormSheet
          open
          onOpenChange={() => undefined}
          options={options}
          problem={problem}
          onSaved={onSaved}
          canAssignOwner
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onSaved };
}

afterEach(() => {
  cleanup();
  update.mockReset();
  handoff.mockReset();
});

describe("ProblemFormSheet group change", () => {
  it("saves the basics first and then asks for the handoff, never a bare group change", async () => {
    update.mockResolvedValue(problem);
    handoff.mockResolvedValue({
      handoff: {
        id: "h1",
        problemId: "p1",
        status: "PENDING",
        reason: "Problem pripada drugoj grupi",
        decisionReason: null,
        createdAt: "2026-11-17T10:00:00.000Z",
        decidedAt: null,
        decidedBy: null,
        requestedBy: { id: "u1", displayName: "Ana" },
        fromGroup: { id: "g1", name: "Grupa A" },
        toGroup: { id: "g2", name: "Grupa B" },
        fromOrganizationalUnit: { id: "ou1", name: "Jedinica A" },
        toOrganizationalUnit: { id: "ou2", name: "Jedinica B" },
      },
      problem: { ...problem, id: "p1" },
    } as never);
    const { onSaved } = renderSheet();

    fireEvent.change(screen.getByTestId("problem-form-group"), { target: { value: "g2" } });
    // The owner is settled on acceptance, so the picker disappears.
    expect(screen.queryByLabelText("problems.form.ownerSearch")).toBeNull();
    fireEvent.change(screen.getByTestId("problem-form-handoff-reason"), {
      target: { value: "Problem pripada drugoj grupi" },
    });
    fireEvent.click(screen.getByTestId("problem-form-submit"));

    await waitFor(() =>
      expect(handoff).toHaveBeenCalledWith("p1", {
        toGroupId: "g2",
        reason: "Problem pripada drugoj grupi",
      }),
    );
    const sent = update.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("groupId");
    expect(sent).not.toHaveProperty("ownerUserId");
    expect(sent).toMatchObject({ version: 7, title: "Štampač ne radi" });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("p1"));
  });

  it("keeps the saved basics and says that the handoff was not requested", async () => {
    update.mockResolvedValue(problem);
    handoff.mockRejectedValue(new ApiError(409, "PROBLEM_HANDOFF_PENDING", "pending"));
    const { onSaved } = renderSheet();

    fireEvent.change(screen.getByTestId("problem-form-group"), { target: { value: "g2" } });
    fireEvent.change(screen.getByTestId("problem-form-handoff-reason"), {
      target: { value: "Problem pripada drugoj grupi" },
    });
    fireEvent.click(screen.getByTestId("problem-form-submit"));

    await waitFor(() => expect(handoff).toHaveBeenCalled());
    // The page still reloads so the user sees the pending transfer and its state.
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("p1"));
  });

  it("updates the group field directly only when nothing changed", async () => {
    update.mockResolvedValue(problem);
    renderSheet();
    fireEvent.click(screen.getByTestId("problem-form-submit"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toMatchObject({ groupId: "g1" });
    expect(handoff).not.toHaveBeenCalled();
  });
});
