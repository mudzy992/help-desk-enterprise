// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemHandoffRequestCard } from "@/components/problems/problem-handoff-request-card";
import { ApiError } from "@/services/api";
import { requestProblemHandoff } from "@/services/problem-handoffs-api";
import type { ProblemDetail } from "@/services/problems-api";

/*
  W7.36: the handoff form is an action, not a permanent banner. It lives inside
  the "Pregled" tab, collapsed to a single line; only a pending handoff keeps a
  card at the top of the record (covered by problem-handoff-panel.spec.tsx).
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/problem-handoffs-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problem-handoffs-api")>();
  return { ...actual, requestProblemHandoff: vi.fn() };
});

const request = vi.mocked(requestProblemHandoff);

const groups = [
  { id: "g1", name: "Grupa A" },
  { id: "g2", name: "Grupa B" },
];

function problemWith(input: { readonly canHandoff?: boolean; readonly pending?: boolean }) {
  return {
    id: "p1",
    number: "P-000012",
    status: "INVESTIGATING",
    group: { id: "g1", name: "Grupa A" },
    handoff: input.pending === true ? { id: "h1" } : null,
    permissions: { canHandoff: input.canHandoff ?? true },
  } as unknown as ProblemDetail;
}

function renderCard(problem: ProblemDetail, onChanged = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemHandoffRequestCard problem={problem} groups={groups} onChanged={onChanged} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onChanged };
}

afterEach(() => {
  cleanup();
  request.mockReset();
});

describe("ProblemHandoffRequestCard", () => {
  it("renders nothing when the problem cannot be handed off", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ProblemHandoffRequestCard
            problem={problemWith({ canHandoff: false })}
            groups={groups}
            onChanged={vi.fn()}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("stays out of the way while another handoff waits for a decision", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ProblemHandoffRequestCard
            problem={problemWith({ pending: true })}
            groups={groups}
            onChanged={vi.fn()}
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(container.textContent).toBe("");
  });

  it("starts collapsed and opens the form on demand", () => {
    renderCard(problemWith({}));

    expect(screen.getByTestId("problem-handoff-request").textContent).toContain(
      "problems.handoff.requestCardCollapsed",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("problem-handoff-request-toggle").getAttribute("aria-expanded")).toBe(
      "false",
    );

    fireEvent.click(screen.getByTestId("problem-handoff-request-toggle"));

    expect(screen.getByRole("combobox")).toBeDefined();
    expect(screen.getByTestId("problem-handoff-request-toggle").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("does not offer the group the problem already sits in", () => {
    renderCard(problemWith({}));
    fireEvent.click(screen.getByTestId("problem-handoff-request-toggle"));

    const options = [...screen.getByRole("combobox").querySelectorAll("option")].map(
      (option) => option.textContent,
    );
    expect(options).toEqual(["problems.form.groupPlaceholder", "Grupa B"]);
  });

  it("refuses to submit without a target and a reason", () => {
    renderCard(problemWith({}));
    fireEvent.click(screen.getByTestId("problem-handoff-request-toggle"));
    fireEvent.click(screen.getByTestId("problem-handoff-submit"));

    expect(screen.getByText("problems.errors.validation")).toBeDefined();
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the request, closes the form and reports success", async () => {
    request.mockResolvedValue({
      handoff: { status: "PENDING", toGroup: { name: "Grupa B" } },
      problem: problemWith({}),
    } as never);
    const { onChanged } = renderCard(problemWith({}));

    fireEvent.click(screen.getByTestId("problem-handoff-request-toggle"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "g2" } });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Problem pripada drugoj grupi" },
    });
    fireEvent.click(screen.getByTestId("problem-handoff-submit"));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("p1", {
        toGroupId: "g2",
        reason: "Problem pripada drugoj grupi",
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull());
  });

  it("keeps a failed request visible inline and repeats it as a toast", async () => {
    request.mockRejectedValue(new ApiError(409, "PROBLEM_HANDOFF_PENDING", "conflict"));
    renderCard(problemWith({}));

    fireEvent.click(screen.getByTestId("problem-handoff-request-toggle"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "g2" } });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Problem pripada drugoj grupi" },
    });
    fireEvent.click(screen.getByTestId("problem-handoff-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("problem-handoff-error").textContent).toBe(
        "problems.errors.handoffPending",
      ),
    );
    // The inline alert and the danger toast both speak.
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(1);
  });
});
