// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/pages/dashboard-page";
import type { DashboardSummaryState } from "@/lib/dashboard/use-dashboard-summary";

const model = vi.hoisted(() => ({ value: null as DashboardSummaryState | null }));
const access = vi.hoisted(() => ({ isStaff: true, isAdmin: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/dashboard/use-dashboard-summary", () => ({
  useDashboardSummary: () => model.value,
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({ marker: "capabilities" }),
}));
vi.mock("@/lib/session/route-access", () => ({
  canOpenAdminArea: () => access.isAdmin,
  canOpenReports: () => access.isStaff,
  isTicketStaff: () => access.isStaff,
}));
vi.mock("@/components/layout/page-header", () => ({
  brandCrumb: "brand",
  PageHeader: () => <div data-testid="page-header" />,
}));
vi.mock("@/components/dashboard/dashboard-metric-grid", () => ({
  DashboardMetricGrid: () => <div data-testid="metric-grid" />,
}));
vi.mock("@/components/dashboard/dashboard-charts", () => ({
  DashboardCharts: () => <div data-testid="charts" />,
}));
vi.mock("@/components/dashboard/dashboard-sla-watchlist", () => ({
  DashboardSlaWatchlist: () => <div data-testid="sla" />,
}));
vi.mock("@/components/dashboard/dashboard-inbox-snapshot", () => ({
  DashboardInboxSnapshot: () => <div data-testid="inbox" />,
}));
vi.mock("@/components/dashboard/dashboard-activity-feed", () => ({
  DashboardActivityFeed: () => <div data-testid="activity" />,
}));
vi.mock("@/components/dashboard/dashboard-attention-table", () => ({
  DashboardAttentionTable: () => <div data-testid="attention" />,
}));
vi.mock("@/components/dashboard/dashboard-recent-tickets", () => ({
  DashboardRecentTickets: () => <div data-testid="recent" />,
}));
vi.mock("@/components/dashboard/setup-checklist-card", () => ({
  SetupChecklistCard: () => <div data-testid="checklist" />,
}));

function summary() {
  return {
    generatedAt: "2026-10-19T12:00:00.000Z",
    volume14d: [],
    total: 3,
    open: 3,
    critical: 0,
    overdue: 0,
    openedToday: 1,
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
    recent: [],
    slaWatchlist: [],
    attention: [],
  } as const;
}

function state(overrides: Partial<DashboardSummaryState> = {}): DashboardSummaryState {
  return {
    isStaff: access.isStaff,
    summary: summary(),
    inboxCount: 0,
    inboxTotalIsCapped: false,
    inboxTickets: [],
    isInboxLoading: false,
    inboxErrorKey: null,
    inboxRequestId: null,
    reloadInbox: vi.fn(() => Promise.resolve()),
    serviceNames: new Map(),
    originNames: new Map(),
    groupNames: new Map(),
    isLoading: false,
    isStale: false,
    errorKey: null,
    requestId: null,
    reload: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    access.isStaff = true;
    access.isAdmin = true;
    model.value = state();
  });
  afterEach(cleanup);

  it("distinguishes loading, hard error and legitimate empty states", () => {
    model.value = state({ isLoading: true });
    const view = renderPage();
    expect(screen.getByText("navigation.dashboard")).toBeTruthy();

    model.value = state({ summary: null, errorKey: "tickets.errorGeneric" });
    view.rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("tickets.errorGeneric")).toBeTruthy();

    model.value = state({ summary: { ...summary(), total: 0 } });
    view.rerender(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("dashboard.emptyTitle")).toBeTruthy();
  });

  it("renders staff panels and the administrator checklist", () => {
    renderPage();
    expect(screen.getByTestId("metric-grid")).toBeTruthy();
    expect(screen.getByTestId("sla")).toBeTruthy();
    expect(screen.getByTestId("inbox")).toBeTruthy();
    expect(screen.getByTestId("checklist")).toBeTruthy();
  });

  it("hides staff and administration panels from a requester", () => {
    access.isStaff = false;
    access.isAdmin = false;
    model.value = state({ isStaff: false });
    renderPage();
    expect(screen.queryByTestId("sla")).toBeNull();
    expect(screen.queryByTestId("inbox")).toBeNull();
    expect(screen.queryByTestId("checklist")).toBeNull();
    expect(screen.getByTestId("activity")).toBeTruthy();
  });
});
