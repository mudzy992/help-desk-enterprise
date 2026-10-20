// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "@/pages/reports-page";

const dashboard = vi.hoisted(() => ({
  value: { dashboard: null, isLoading: false, error: null, reload: vi.fn() },
}));
const trendsProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "bs" } }),
}));
vi.mock("@/lib/session/use-session-capabilities", () => ({
  useSessionCapabilities: () => ({
    session: { principal: { displayName: "Agent" } },
    hasPermission: () => true,
  }),
}));
vi.mock("@/services/organizational-units-api", () => ({
  listOrganizationalUnitTree: vi.fn().mockResolvedValue([
    { id: "ou-1", name: "One", ouPath: "One", children: [] },
    { id: "ou-2", name: "Two", ouPath: "Two", children: [] },
  ]),
}));
vi.mock("@/lib/reports/use-reports-dashboard-data", () => ({
  useReportsDashboardData: () => dashboard.value,
}));
vi.mock("@/lib/reports/use-report-filter-options", () => ({
  useReportFilterOptions: () => ({ services: [], groups: [], isLoading: false, load: vi.fn() }),
}));
vi.mock("@/components/reports/print/report-print", () => ({
  useLightPrintTheme: vi.fn(),
  ReportPrintHeader: () => <div data-testid="print-header" />,
}));
vi.mock("@/components/layout/page-header", () => ({
  brandCrumb: "brand",
  PageHeader: ({ actions }: { actions: unknown }) => <header>{actions as never}</header>,
}));
vi.mock("@/components/ui/tabs", () => ({
  UnderlineTabs: ({
    items,
    onChange,
  }: {
    items: { key: string }[];
    onChange: (key: string) => void;
  }) => (
    <nav aria-label="reports-tabs">
      {items.map((item) => (
        <button key={item.key} onClick={() => onChange(item.key)}>
          {item.key}
        </button>
      ))}
    </nav>
  ),
}));
vi.mock("@/components/reports/trends/report-trends-panel", () => ({
  ReportTrendsPanel: (props: Record<string, unknown>) => {
    trendsProps.value = props;
    return <div data-testid="trends-panel" />;
  },
}));
vi.mock("@/components/reports/report-packs-panel", () => ({
  ReportPacksPanel: () => <div data-testid="packs" />,
}));
vi.mock("@/components/reports/reports-bottlenecks-panel", () => ({
  ReportsBottlenecksPanel: () => <div data-testid="bottlenecks" />,
}));
vi.mock("@/components/reports/reports-csat-panel", () => ({
  ReportsCsatPanel: () => <div data-testid="csat" />,
}));
vi.mock("@/components/reports/schedules/report-schedules-panel", () => ({
  ReportSchedulesPanel: () => <div data-testid="schedules" />,
}));

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}
function renderPage(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ReportsPage />
      <Location />
    </MemoryRouter>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  trendsProps.value = null;
});

describe("ReportsPage URL and structural contract", () => {
  it("renders a deep-linked tab with the same OU scope", async () => {
    renderPage("/reports?tab=trends&organizationalUnitId=ou-2&preset=90d&priority=HIGH");
    await waitFor(() => expect(screen.getByTestId("trends-panel")).toBeTruthy());
    expect(trendsProps.value?.organizationalUnitId).toBe("ou-2");
    expect((trendsProps.value?.state as { priority: string }).priority).toBe("HIGH");
  });

  it("preserves OU and overview window when navigating tabs", async () => {
    renderPage(
      "/reports?organizationalUnitId=ou-1&window=custom&windowFrom=2026-01-01&windowTo=2026-01-31",
    );
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "reports-tabs" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "packs" }));
    expect(screen.getByTestId("location").textContent).toContain("organizationalUnitId=ou-1");
    expect(screen.getByTestId("location").textContent).toContain("windowFrom=2026-01-01");
    expect(screen.getByTestId("packs")).toBeTruthy();
  });

  it("blocks scoped report panels for an invalid custom period", async () => {
    renderPage(
      "/reports?tab=packs&organizationalUnitId=ou-1&window=custom&windowFrom=2026-02-20&windowTo=2026-02-10",
    );
    await waitFor(() =>
      expect(screen.getByText("reports.errors.REPORT_WINDOW_INVALID")).toBeTruthy(),
    );
    expect(screen.queryByTestId("packs")).toBeNull();
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });
});
