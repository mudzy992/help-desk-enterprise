// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import bsDashboard from "@/i18n/locales/bs/common.json";
import { DashboardMetricGrid } from "@/components/dashboard/dashboard-metric-grid";
import type { DashboardSummary } from "@/lib/dashboard/compose-dashboard-summary";

await i18next.use(initReactI18next).init({
  resources: { bs: { common: bsDashboard } },
  lng: "bs",
  fallbackLng: "bs",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

function makeSummary(): DashboardSummary {
  return {
    generatedAt: "2026-10-14T12:00:00.000Z",
    total: 100,
    open: 50,
    critical: 4,
    overdue: 7,
    openedToday: 2,
    waitingForUser: 3,
    pendingApproval: 1,
    resolved: 30,
    closed: 20,
    unrouted: 5,
    unassigned: 6,
    assignedToMe: 2,
    requestedByMe: 1,
    statusCounts: [{ status: "PENDING", count: 50 }],
    priorityCounts: [{ priority: "HIGH", count: 10 }],
    volume14d: [],
    recent: [],
    slaWatchlist: [],
    attention: [],
    volumeTruncated: false,
  };
}

// Val 6.1 / modul 4 (D17): regression test for card deep links. Each link must
// carry the matching server filter the list parser already understands. If a
// card's URL drifts back to "/tickets?view=all" without the filter keyword, a
// user clicking "Kritični" lands on every ticket instead of the critical ones.
describe("DashboardMetricGrid links", () => {
  function links(): readonly HTMLAnchorElement[] {
    const { container } = render(
      <I18nextProvider i18n={i18next}>
        <MemoryRouter>
          <DashboardMetricGrid summary={makeSummary()} inboxCount={12} isStaff />
        </MemoryRouter>
      </I18nextProvider>,
    );
    return [...container.querySelectorAll("a")];
  }

  it("links the critical card to priority=CRITICAL", () => {
    const link = links().find((element) =>
      (element.textContent ?? "").includes(bsDashboard.dashboard.metricCritical),
    );
    expect(link?.getAttribute("href")).toContain("priority=CRITICAL");
  });

  it("links the unrouted card to status=UNROUTED", () => {
    const link = links().find((element) =>
      (element.textContent ?? "").includes(bsDashboard.dashboard.metricUnrouted),
    );
    expect(link?.getAttribute("href")).toContain("status=UNROUTED");
  });

  it("links overdue card to overdue=true", () => {
    const link = links().find((element) =>
      (element.textContent ?? "").includes(bsDashboard.dashboard.metricOverdue),
    );
    expect(link?.getAttribute("href")).toContain("overdue=true");
  });

  it("links waiting-for-user to the matching status", () => {
    const link = links().find((element) =>
      (element.textContent ?? "").includes(bsDashboard.dashboard.metricWaitingForUser),
    );
    expect(link?.getAttribute("href")).toContain("status=WAITING_FOR_USER");
  });
});
