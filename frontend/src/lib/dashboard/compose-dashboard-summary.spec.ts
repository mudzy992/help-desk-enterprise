import { describe, expect, it } from "vitest";
import { composeDashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";
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

function counts(
  overrides: Partial<DashboardSummaryCounts> = {},
): DashboardSummaryCounts {
  return {
    scope: "all",
    generatedAt: "2026-09-14T15:00:00.000Z",
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

describe("composeDashboardSummary", () => {
  it("takes every counter from the server aggregate", () => {
    const summary = composeDashboardSummary({
      counts: counts({
        total: 1200,
        open: 640,
        critical: 12,
        overdue: 33,
        openedToday: 21,
        waitingForUser: 8,
        statusCounts: [{ status: "PENDING", count: 640 }],
      }),
      tickets: [ticket("1", "PENDING")],
      currentUserId: "user-1",
    });

    expect(summary.total).toBe(1200);
    expect(summary.open).toBe(640);
    expect(summary.critical).toBe(12);
    expect(summary.overdue).toBe(33);
    expect(summary.openedToday).toBe(21);
    expect(summary.waitingForUser).toBe(8);
    expect(summary.statusCounts).toEqual([{ status: "PENDING", count: 640 }]);
  });

  it("derives the presentation slices from the ticket page it was given", () => {
    const now = new Date(2026, 8, 14, 15, 0, 0);
    const summary = composeDashboardSummary({
      counts: counts(),
      tickets: [
        ticket("1", "PENDING", {
          priority: "CRITICAL",
          createdAt: new Date(2026, 8, 14, 8, 0, 0).toISOString(),
        }),
        ticket("2", "IN_PROGRESS", {
          isOverdue: true,
          createdAt: new Date(2026, 8, 13, 10, 0, 0).toISOString(),
        }),
        ticket("4", "ASSIGNED", {
          isOverdue: true,
          createdAt: new Date(2026, 8, 14, 8, 0, 0).toISOString(),
        }),
      ],
      currentUserId: null,
      now,
    });

    // Overdue tickets feed the watch list; the unattended critical one feeds the
    // attention list (the selectors are unchanged, only their input is a page).
    expect(summary.slaWatchlist.map((item) => item.id)).toEqual(["4", "2"]);
    expect(summary.attention.map((item) => item.id)).toEqual(["1"]);
    expect(summary.recent.map((item) => item.id)).toEqual(["1", "4", "2"]);
  });

  it("orders recent tickets newest first", () => {
    const summary = composeDashboardSummary({
      counts: counts(),
      tickets: [ticket("1", "PENDING"), ticket("3", "PENDING"), ticket("2", "PENDING")],
      currentUserId: null,
    });
    expect(summary.recent.map((item) => item.id)).toEqual(["3", "2", "1"]);
  });

  it("buckets created and resolved tickets across the last 14 local days", () => {
    const now = new Date(2026, 8, 14, 15, 0, 0);
    const summary = composeDashboardSummary({
      counts: counts(),
      tickets: [
        ticket("1", "PENDING", {
          createdAt: new Date(2026, 8, 14, 8, 0, 0).toISOString(),
        }),
        ticket("2", "RESOLVED", {
          createdAt: new Date(2026, 8, 1, 9, 0, 0).toISOString(),
          resolvedAt: new Date(2026, 8, 13, 10, 0, 0).toISOString(),
        }),
        ticket("4", "RESOLVED", {
          createdAt: new Date(2026, 8, 10, 9, 0, 0).toISOString(),
        }),
      ],
      currentUserId: null,
      now,
    });

    expect(summary.volume14d).toHaveLength(14);
    expect(summary.volume14d[0]).toEqual({ d: "01. 09", created: 1, resolved: 0 });
    expect(summary.volume14d[12]).toEqual({ d: "13. 09", created: 0, resolved: 1 });
    expect(summary.volume14d[13]).toEqual({ d: "14. 09", created: 1, resolved: 0 });
    expect(summary.volume14d[9]).toEqual({ d: "10. 09", created: 1, resolved: 0 });
  });

  it("keeps the chart empty rather than undefined when the page is empty", () => {
    const now = new Date(2026, 8, 14, 15, 0, 0);
    const summary = composeDashboardSummary({
      counts: counts(),
      tickets: [],
      currentUserId: null,
      now,
    });
    expect(summary.volume14d).toHaveLength(14);
    expect(
      summary.volume14d.every((day) => day.created === 0 && day.resolved === 0),
    ).toBe(true);
    expect(summary.recent).toEqual([]);
  });
});
