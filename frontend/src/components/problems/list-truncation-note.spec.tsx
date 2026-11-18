// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListTruncationNote } from "@/components/problems/list-truncation-note";
import { ProblemHistoryPanel } from "@/components/problems/problem-history-panel";
import { ProblemTicketsPanel } from "@/components/problems/problem-tickets-panel";
import { getProblemEvents, getProblemTickets } from "@/services/problems-api";
import type { ProblemDetail } from "@/services/problems-api";

/*
  BA-problems-17: every bounded list is a window and the screen says so. The
  server proves `hasMore` (limit + 1, or counted rows), so the panel can state
  the window size and, for linked tickets, the real total.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}:${JSON.stringify(options)}`,
    i18n: { language: "bs" },
  }),
}));

vi.mock("@/services/problems-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/problems-api")>();
  return {
    ...actual,
    getProblemEvents: vi.fn(),
    getProblemTickets: vi.fn(),
  };
});

const events = vi.mocked(getProblemEvents);
const tickets = vi.mocked(getProblemTickets);

const problem = {
  id: "p1",
  number: "P-000012",
  status: "INVESTIGATING",
  version: 3,
  permissions: { canManage: true, canClose: true, canClaim: false, canLink: false },
} as unknown as ProblemDetail;

function renderWith(ui: React.ReactElement, { router = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
  render(router ? <MemoryRouter>{tree}</MemoryRouter> : tree);
}

afterEach(() => {
  cleanup();
  events.mockReset();
  tickets.mockReset();
});

describe("list truncation notes (BA-problems-17)", () => {
  it("states the window size when only the count is known", () => {
    renderWith(<ListTruncationNote count={200} testId="note" />);
    expect(screen.getByTestId("note").textContent).toBe('problems.lists.capped:{"count":200}');
  });

  it("states the real total when the server counts it", () => {
    renderWith(<ListTruncationNote count={500} total={620} testId="note" />);
    expect(screen.getByTestId("note").textContent).toBe(
      'problems.lists.cappedOfTotal:{"count":500,"total":620}',
    );
  });

  it("marks a capped timeline", async () => {
    events.mockResolvedValue({
      items: [
        {
          id: "e1",
          action: "created",
          actor: null,
          detail: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      hasMore: true,
    });
    renderWith(<ProblemHistoryPanel problemId="p1" versionKey={3} />);
    expect(await screen.findByTestId("problem-events-capped")).toBeDefined();
  });

  it("keeps the timeline quiet when the window holds everything", async () => {
    events.mockResolvedValue({
      items: [
        {
          id: "e1",
          action: "created",
          actor: null,
          detail: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      hasMore: false,
    });
    renderWith(<ProblemHistoryPanel problemId="p1" versionKey={3} />);
    expect(await screen.findByText("problems.history.title")).toBeDefined();
    expect(screen.queryByTestId("problem-events-capped")).toBeNull();
  });

  it("says how many of the real total the ticket table shows", async () => {
    const row = {
      id: "t1",
      ticketNumber: "T-000001",
      title: "VPN",
      confidential: false,
      status: "NEW" as const,
      priority: "MEDIUM" as const,
      requester: null,
      organizationalUnit: { id: "ou1", name: "Jedinica A" },
      assignee: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      linkedAt: "2026-01-01T00:00:00.000Z",
    };
    tickets.mockResolvedValue({
      items: [
        { ...row, id: "t1", ticketNumber: "T-000001" },
        { ...row, id: "t2", ticketNumber: "T-000002" },
      ],
      total: 620,
      open: 40,
      hasMore: true,
    } as never);
    renderWith(<ProblemTicketsPanel problem={problem} onChanged={vi.fn()} />, { router: true });
    const note = await screen.findByTestId("problem-tickets-capped");
    expect(note.textContent).toContain('"total":620');
    expect(note.textContent).toContain('"count":2');
  });
});
