import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDashboardPrimary } from "@/lib/dashboard/load-dashboard-primary";
import { fetchDashboardSummary } from "@/services/report-summary-api";
import { listTicketsPage } from "@/services/tickets-api";

vi.mock("@/services/report-summary-api", () => ({ fetchDashboardSummary: vi.fn() }));
vi.mock("@/services/tickets-api", () => ({ listTicketsPage: vi.fn() }));

const counts = {
  generatedAt: "2026-10-19T12:00:00.000Z",
  volume14d: [],
  total: 0,
  open: 0,
  critical: 0,
  overdue: 0,
  openedToday: 0,
  waitingForUser: 0,
  pendingApproval: 0,
  resolved: 0,
  closed: 0,
  unrouted: 0,
  unassigned: 0,
  assignedToMe: 0,
  requestedByMe: 0,
  statusCounts: [],
  priorityCounts: [],
} as const;
const page = { items: [], total: 0, page: 1, pageSize: 25, totalsAsOf: 0 } as const;
const queryClient = {
  fetchQuery: ({ queryFn }: { readonly queryFn: () => Promise<unknown> }) => queryFn(),
};

describe("loadDashboardPrimary request matrix", () => {
  beforeEach(() => {
    vi.mocked(fetchDashboardSummary).mockReset().mockResolvedValue(counts);
    vi.mocked(listTicketsPage).mockReset().mockResolvedValue(page);
  });

  it("does not request the staff-only critical queue for a requester", async () => {
    await loadDashboardPrimary({
      queryClient: queryClient as never,
      dayKey: "2026-10-19",
      currentUserId: "requester-1",
      isStaff: false,
    });

    expect(listTicketsPage).toHaveBeenCalledTimes(4);
    expect(listTicketsPage).not.toHaveBeenCalledWith(
      expect.objectContaining({ priority: "CRITICAL", unassigned: true }),
    );
  });

  it("requests bounded, server-filtered staff watch and attention queues", async () => {
    await loadDashboardPrimary({
      queryClient: queryClient as never,
      dayKey: "2026-10-19",
      currentUserId: "agent-1",
      isStaff: true,
    });

    expect(listTicketsPage).toHaveBeenCalledWith(
      expect.objectContaining({ overdue: true, sort: "slaDueAt", dir: "asc", pageSize: 5 }),
    );
    expect(listTicketsPage).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "CRITICAL", unassigned: true, pageSize: 8 }),
    );
    expect(listTicketsPage).toHaveBeenCalledTimes(5);
  });
});
