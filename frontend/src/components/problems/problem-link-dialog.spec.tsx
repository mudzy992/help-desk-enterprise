// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemLinkDialog } from "@/components/problems/problem-link-dialog";
import { ApiError } from "@/services/api";
import { createProblem } from "@/services/problems-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));

vi.mock("@/services/problems-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problems-api")>();
  return {
    ...actual,
    createProblem: vi.fn(),
    getProblemOptions: vi.fn(async () => ({
      groups: [{ id: "g1", name: "Grupa A" }],
      organizationalUnits: [],
      services: [],
    })),
    listProblems: vi.fn(async () => ({ items: [], total: 0, nextCursor: null })),
    linkProblemTickets: vi.fn(),
  };
});

const create = vi.mocked(createProblem);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tickets = [
  {
    id: "t1",
    ticketNumber: "T-1",
    title: "Štampač ne radi",
    priority: "MEDIUM" as const,
  },
];

function renderDialog(onDone = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemLinkDialog open onOpenChange={vi.fn()} tickets={tickets} onDone={onDone} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onDone;
}

async function fillForm() {
  fireEvent.change(await screen.findByLabelText(/problems\.fields\.title/u), {
    target: { value: "Mreža u zgradi A" },
  });
  fireEvent.change(screen.getByLabelText(/problems\.fields\.description/u), {
    target: { value: "Prekidi svakih deset minuta." },
  });
  fireEvent.change(screen.getByTestId("problem-link-group"), { target: { value: "g1" } });
}

describe("ProblemLinkDialog create (W7.26)", () => {
  it("reuses one clientRequestId when the create is retried", async () => {
    create.mockRejectedValueOnce(new Error("mreža je pala"));
    create.mockResolvedValueOnce({
      id: "p1",
      number: "P-000001",
      ticketLinks: null,
    } as never);
    const onDone = renderDialog();
    await fillForm();
    fireEvent.click(screen.getByTestId("problem-link-submit"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("problem-link-submit"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    const [first, second] = create.mock.calls;
    const key = (first?.[0] as { clientRequestId?: string }).clientRequestId;
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect((second?.[0] as { clientRequestId?: string }).clientRequestId).toBe(key);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ problemId: "p1" }));
  });

  it("shows the all-or-nothing error inline and as a danger toast, and keeps the dialog open", async () => {
    create.mockRejectedValueOnce(new ApiError(409, "PROBLEM_TICKETS_NOT_LINKED", "ticketIds"));
    const onDone = renderDialog();
    await fillForm();
    fireEvent.click(screen.getByTestId("problem-link-submit"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("problems.errors.ticketsNotLinked");
    const toasts = await screen.findAllByTestId("toast");
    expect(toasts.some((toast) => toast.getAttribute("data-tone") === "danger")).toBe(true);
    // The problem was not created: the dialog stays usable for a retry.
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("problem-link-submit")).toBeTruthy();
  });
});
