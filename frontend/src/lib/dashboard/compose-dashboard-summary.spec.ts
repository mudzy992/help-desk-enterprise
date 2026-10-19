import { describe, expect, it } from "vitest";
import {
  composeDashboardSummary,
  dashboardRecentTicketLimit,
} from "@/lib/dashboard/compose-dashboard-summary";
import type { DashboardSummaryCounts } from "@/services/report-summary-api";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

function ticket(
  id: string,
  status: TicketStatus,
  overrides: Partial<TicketResponse> = {},
): TicketResponse {
  return {
    id,
    ticketNumber: `T-${id}`,
    title: `Ticket ${id}`,
    description: "",
    status,
    priority: "MEDIUM",
    impact: "MEDIUM",
    urgency: "MEDIUM",
    classification: "INTERNAL",
    isConfidential: false,
    formData: null,
    originUnitId: "ou-1",
    serviceId: "svc-1",
    formVersionRef: "form-1",
    requesterId: "user-1",
    assignedGroupId: "group-1",
    assignedUserId: null,
    createdAt: `2026-09-0${id}T10:00:00.000Z`,
    updatedAt: `2026-09-0${id}T10:00:00.000Z`,
    ...overrides,
  };
}

function counts(overrides: Partial<DashboardSummaryCounts> = {}): DashboardSummaryCounts {
  return {
    generatedAt: "2026-09-14T15:00:00.000Z",
    volume14d: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      created: 0,
      resolved: 0,
    })),
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
    ...overrides,
  };
}

/** Val 1 every list now has its own server-filtered input. */
function summaryInput(
  overrides: {
    readonly recentTickets?: readonly TicketResponse[];
    readonly overdueTickets?: readonly TicketResponse[];
    readonly assignedToMeTickets?: readonly TicketResponse[];
    readonly unassignedTickets?: readonly TicketResponse[];
    readonly currentUserId?: string | null;
    readonly counts?: Partial<DashboardSummaryCounts>;
  } = {},
) {
  return {
    counts: counts(overrides.counts),
    recentTickets: overrides.recentTickets ?? [],
    overdueTickets: overrides.overdueTickets ?? [],
    assignedToMeTickets: overrides.assignedToMeTickets ?? [],
    unassignedTickets: overrides.unassignedTickets ?? [],
    currentUserId: overrides.currentUserId ?? null,
  };
}

describe("composeDashboardSummary", () => {
  it("takes every counter from the server aggregate", () => {
    const summary = composeDashboardSummary(
      summaryInput({
        counts: {
          total: 1200,
          open: 640,
          critical: 12,
          overdue: 33,
          openedToday: 21,
          waitingForUser: 8,
          statusCounts: [{ status: "PENDING", count: 640 }],
        },
      }),
    );

    expect(summary.total).toBe(1200);
    expect(summary.open).toBe(640);
    expect(summary.critical).toBe(12);
    expect(summary.overdue).toBe(33);
    expect(summary.openedToday).toBe(21);
    expect(summary.waitingForUser).toBe(8);
    expect(summary.statusCounts).toEqual([{ status: "PENDING", count: 640 }]);
  });

  it("keeps the watch and attention lists on their own server-filtered inputs", () => {
    const summary = composeDashboardSummary(
      summaryInput({
        // Server sends overdue tickets only, newest first.
        overdueTickets: [
          ticket("4", "ASSIGNED", { isOverdue: true }),
          ticket("2", "IN_PROGRESS", { isOverdue: true }),
        ],
        // Attention: open tickets assigned to the caller plus open unassigned ones.
        assignedToMeTickets: [ticket("6", "IN_PROGRESS", { assignedUserId: "user-1" })],
        unassignedTickets: [
          ticket("1", "PENDING", { priority: "CRITICAL", assignedUserId: null }),
          ticket("7", "UNROUTED", { assignedUserId: null }),
        ],
        currentUserId: "user-1",
      }),
    );

    expect(summary.slaWatchlist.map((item) => item.id)).toEqual(["4", "2"]);
    expect(summary.attention.map((item) => item.id)).toEqual(["6", "1", "7"]);
  });

  it("orders recent tickets newest first and cuts them to the limit", () => {
    const many = Array.from({ length: dashboardRecentTicketLimit + 3 }, (_, index) =>
      ticket(String((index % 9) + 1), "PENDING", {
        createdAt: `2026-09-${String(10 + index).padStart(2, "0")}T10:00:00.000Z`,
      }),
    );
    const summary = composeDashboardSummary(summaryInput({ recentTickets: [...many].reverse() }));

    expect(summary.recent).toHaveLength(dashboardRecentTicketLimit);
    expect(summary.recent[0].createdAt >= summary.recent[1].createdAt).toBe(true);
  });

  it("uses the exact server-side daily aggregate without rebucketing ticket rows", () => {
    const volume14d = Array.from({ length: 14 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      created: index === 13 ? 4 : 0,
      resolved: index === 12 ? 3 : 0,
    }));
    const summary = composeDashboardSummary(summaryInput({ counts: { volume14d } }));

    expect(summary.volume14d).toEqual(volume14d);
  });

  it("keeps the chart empty rather than undefined when there is no data", () => {
    const summary = composeDashboardSummary(summaryInput());

    expect(summary.volume14d).toHaveLength(14);
    expect(summary.volume14d.every((day) => day.created === 0 && day.resolved === 0)).toBe(true);
    expect(summary.recent).toEqual([]);
    expect(summary.attention).toEqual([]);
  });
});
