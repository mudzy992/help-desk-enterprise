// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemHandoffPanel } from "@/components/problems/problem-handoff-panel";
import { ApiError } from "@/services/api";
import {
  acceptProblemHandoff,
  cancelProblemHandoff,
  rejectProblemHandoff,
  requestProblemHandoff,
} from "@/services/problem-handoffs-api";
import type { ProblemDetail, ProblemOptions } from "@/services/problems-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/problem-handoffs-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problem-handoffs-api")>();
  return {
    ...actual,
    acceptProblemHandoff: vi.fn(),
    cancelProblemHandoff: vi.fn(),
    rejectProblemHandoff: vi.fn(),
    requestProblemHandoff: vi.fn(),
  };
});

const accept = vi.mocked(acceptProblemHandoff);
const cancel = vi.mocked(cancelProblemHandoff);
const reject = vi.mocked(rejectProblemHandoff);
const request = vi.mocked(requestProblemHandoff);

const options: ProblemOptions = {
  units: [{ id: "ou1", name: "Jedinica A", path: "/root/ou1" }],
  services: [],
  groups: [
    { id: "g1", name: "Grupa A" },
    { id: "g2", name: "Grupa B" },
  ],
  rootCauseCategories: ["SW"],
  homeOrganizationalUnitId: "ou1",
};

const pendingHandoff = {
  id: "h1",
  status: "PENDING" as const,
  reason: "Problem pripada drugoj grupi",
  createdAt: "2026-11-17T10:00:00.000Z",
  requestedBy: { id: "u1", displayName: "Ana" },
  toGroup: { id: "g2", name: "Grupa B" },
  toOrganizationalUnit: { id: "ou2", name: "Jedinica B" },
};

function problemWith(
  permissions: Partial<ProblemDetail["permissions"]>,
  handoff: typeof pendingHandoff | null = pendingHandoff,
) {
  return {
    id: "p1",
    number: "P-000012",
    status: "INVESTIGATING",
    version: 3,
    group: { id: "g1", name: "Grupa A" },
    organizationalUnit: { id: "ou1", name: "Jedinica A", ouPath: "/root/ou1" },
    handoff,
    permissions: {
      canManage: true,
      canClose: true,
      canClaim: false,
      canLink: true,
      canHandoff: true,
      canDecideHandoff: true,
      canCancelHandoff: true,
      ...permissions,
    },
  } as unknown as ProblemDetail;
}

function renderPanel(problem: ProblemDetail, onChanged = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemHandoffPanel problem={problem} options={options} onChanged={onChanged} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onChanged };
}

afterEach(() => {
  cleanup();
  accept.mockReset();
  cancel.mockReset();
  reject.mockReset();
  request.mockReset();
});

describe("ProblemHandoffPanel", () => {
  it("shows who asked for which group, and accepts it on the spot", async () => {
    accept.mockResolvedValue({} as never);
    const { onChanged } = renderPanel(problemWith({}));

    const panel = screen.getByTestId("problem-handoff-panel");
    expect(panel.textContent).toContain("problems.handoff.pendingTitle");
    expect(panel.textContent).toContain("Grupa B");
    expect(panel.textContent).toContain("Jedinica B");
    expect(panel.textContent).toContain("Ana");
    expect(panel.textContent).toContain("Problem pripada drugoj grupi");

    fireEvent.click(screen.getByTestId("problem-handoff-accept"));

    await waitFor(() => expect(accept).toHaveBeenCalledWith("p1", "h1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("rejects only with a reason the receiving side can read", async () => {
    reject.mockResolvedValue({} as never);
    renderPanel(problemWith({}));

    fireEvent.click(screen.getByText("problems.handoff.reject"));
    const confirm = screen.getByTestId("problem-handoff-reject-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Nije naša domena" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith("p1", "h1", { reason: "Nije naša domena" }),
    );
  });

  it("lets the requester call it off", async () => {
    cancel.mockResolvedValue({} as never);
    const { onChanged } = renderPanel(problemWith({ canDecideHandoff: false }));
    fireEvent.click(screen.getByTestId("problem-handoff-cancel"));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("p1", "h1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows a bystander what is happening without any action", () => {
    renderPanel(problemWith({ canDecideHandoff: false, canCancelHandoff: false }));
    expect(screen.getByTestId("problem-handoff-panel").textContent).toContain(
      "problems.handoff.pendingHint",
    );
    expect(screen.queryByTestId("problem-handoff-accept")).toBeNull();
    expect(screen.queryByTestId("problem-handoff-cancel")).toBeNull();
  });

  it("explains a conflicting decision inline and as a toast", async () => {
    accept.mockRejectedValue(new ApiError(409, "PROBLEM_HANDOFF_PENDING", "conflict"));
    renderPanel(problemWith({}));
    fireEvent.click(screen.getByTestId("problem-handoff-accept"));
    await waitFor(() =>
      expect(screen.getByTestId("problem-handoff-error").textContent).toBe(
        "problems.errors.handoffPending",
      ),
    );
  });

  it("requests a handoff from the problem itself", async () => {
    request.mockResolvedValue({
      handoff: { ...pendingHandoff, status: "PENDING" },
      problem: problemWith({}),
    } as never);
    const { onChanged } = renderPanel(problemWith({}, null));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "g2" } });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Problem pripada drugoj grupi" },
    });
    fireEvent.click(screen.getByTestId("problem-handoff-request"));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("p1", {
        toGroupId: "g2",
        reason: "Problem pripada drugoj grupi",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("stays out of the way when there is nothing to hand off", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ProblemHandoffPanel
            problem={problemWith({ canHandoff: false }, null)}
            options={options}
            onChanged={vi.fn()}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe("");
  });
});
