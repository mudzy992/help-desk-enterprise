// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { ProblemResolutionRunPanel } from "@/components/problems/problem-resolution-run-panel";
import { getLatestProblemResolutionRun, resumeProblemResolutionRun } from "@/services/problems-api";
import type {
  ProblemDetail,
  ProblemResolutionRun,
  ProblemTicketResolveOutcome,
} from "@/services/problems-api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/problems-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problems-api")>();
  return {
    ...actual,
    getLatestProblemResolutionRun: vi.fn(),
    resumeProblemResolutionRun: vi.fn(),
  };
});

const latestRun = vi.mocked(getLatestProblemResolutionRun);
const resumeRun = vi.mocked(resumeProblemResolutionRun);

const problem = {
  id: "p1",
  number: "P-000012",
  status: "RESOLVED",
  version: 3,
  permissions: { canManage: true, canClose: true, canClaim: false, canLink: true },
} as unknown as ProblemDetail;

const run: ProblemResolutionRun = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "PARTIAL",
  total: 2,
  resolved: 1,
  messagePending: 0,
  failed: 1,
  skipped: 0,
  canResume: true,
  createdAt: "2027-11-30T09:00:00.000Z",
  updatedAt: "2027-11-30T09:00:05.000Z",
  completedAt: null,
  lastError: "TICKET_OPERATION_FAILED",
  items: [
    {
      id: "i1",
      ticketId: "t1",
      ticketNumber: "T-1",
      ordinal: 0,
      status: "RESOLVED",
      reason: null,
      errorCode: null,
      retryable: null,
      messageSent: true,
      attempts: 1,
    },
    {
      id: "i2",
      ticketId: "t2",
      ticketNumber: "T-2",
      ordinal: 1,
      status: "FAILED",
      reason: null,
      errorCode: "TICKET_OPERATION_FAILED",
      retryable: true,
      messageSent: false,
      attempts: 1,
    },
  ],
};

const finished: ProblemTicketResolveOutcome = {
  resolved: [
    { ticketId: "t1", ticketNumber: "T-1", messageSent: true },
    { ticketId: "t2", ticketNumber: "T-2", messageSent: true },
  ],
  skipped: [],
  failed: [],
  runId: run.id,
  status: "SUCCEEDED",
  canResume: false,
  messagePending: 0,
};

function renderPanel(onResumed = vi.fn(), target: ProblemDetail = problem) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ProblemResolutionRunPanel problem={target} onResumed={onResumed} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onResumed };
}

afterEach(() => {
  cleanup();
  latestRun.mockReset();
  resumeRun.mockReset();
});

describe("ProblemResolutionRunPanel", () => {
  it("shows the unfinished tickets and retries only through the run resume", async () => {
    latestRun.mockResolvedValue({ run });
    resumeRun.mockResolvedValue({ ...problem, ticketResolution: finished });
    const { onResumed } = renderPanel();

    const button = await screen.findByTestId("problem-resolution-run-resume");
    expect(screen.getByTestId("problem-resolution-run-panel").textContent).toContain(
      "problems.resolveTickets.run.incomplete",
    );
    expect(screen.getByText(/T-2/)).toBeTruthy();

    fireEvent.click(button);

    await waitFor(() => {
      expect(resumeRun).toHaveBeenCalledWith("p1", run.id);
    });
    await waitFor(() => {
      expect(onResumed).toHaveBeenCalled();
    });
  });

  it("renders nothing when the newest run has no work left", async () => {
    latestRun.mockResolvedValue({ run: { ...run, status: "PARTIAL", canResume: false } });
    renderPanel();
    await waitFor(() => {
      expect(latestRun).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("problem-resolution-run-panel")).toBeNull();
    expect(screen.queryByTestId("problem-resolution-run-resume")).toBeNull();
  });

  it("does not query runs for a problem the viewer cannot close", async () => {
    const viewerWithoutClose = {
      ...problem,
      permissions: { ...problem.permissions, canClose: false },
    } as unknown as ProblemDetail;
    renderPanel(vi.fn(), viewerWithoutClose);
    // The panel needs problem.close; without it no run request is issued at all.
    expect(latestRun).not.toHaveBeenCalled();
    expect(screen.queryByTestId("problem-resolution-run-panel")).toBeNull();
  });
});
