import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityMetricsCard } from "@/components/admin/admin-security-metrics-card";
import type { LoginSecurityMetricsSnapshot } from "@/services/security-api";

/*
  Paket 5.4.0-e: the Nadzor security card renders the loading state first — the
  spec pins that the title and the refresh affordance exist before any data
  arrives, so an empty or slow Redis never leaves a blank surface.

  Paket 5.4.0-e.2 (review of the live surface): the four counters used to be
  badges in a wrapping row, and a badge never breaks its line — a long label
  pushed the row out of the card. They are four tiles in a grid now, so this
  spec also guards against the badges ever coming back.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}|${JSON.stringify(options)}`,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

function renderWith(snapshot?: LoginSecurityMetricsSnapshot) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (snapshot !== undefined) {
    client.setQueryData(["admin", "security", "metrics", "last-hour"], snapshot);
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AdminSecurityMetricsCard />
    </QueryClientProvider>,
  );
}

function series(total: number, peakPerMinute: number, counts: readonly number[]) {
  const start = Date.UTC(2026, 9, 12, 8, 0, 0);
  return {
    total,
    peakPerMinute,
    points: counts.map((count, index) => ({
      at: new Date(start + index * 60_000).toISOString(),
      count,
    })),
  };
}

const snapshotWithEvents: LoginSecurityMetricsSnapshot = {
  generatedAt: "2026-10-12T09:00:00.000Z",
  windowSeconds: 3600,
  metrics: {
    "login-429": series(12, 3, [0, 3, 5, 4]),
    "login-account-delays": series(7, 2, [0, 1, 4, 2]),
    "mfa-failures": series(2, 1, [0, 0, 2, 0]),
    "hibp-skipped": series(5, 3, [0, 3, 0, 2]),
  },
};

const snapshotWithoutEvents: LoginSecurityMetricsSnapshot = {
  generatedAt: "2026-10-12T09:00:00.000Z",
  windowSeconds: 3600,
  metrics: {
    "login-429": series(0, 0, [0, 0, 0, 0]),
    "login-account-delays": series(0, 0, [0, 0, 0, 0]),
    "mfa-failures": series(0, 0, [0, 0, 0, 0]),
    "hibp-skipped": series(0, 0, [0, 0, 0, 0]),
  },
};

describe("AdminSecurityMetricsCard", () => {
  it("renders the card header and the loading state without a cache entry", () => {
    const html = renderWith();
    expect(html).toContain("admin.ops.securityMetrics.title");
    expect(html).toContain("admin.ops.securityMetrics.body");
    expect(html).toContain("admin.ops.securityMetrics.refresh");
    expect(html).toContain("admin.ops.securityMetrics.loading");
  });

  it("shows the four counters as grid tiles with their numbers", () => {
    const html = renderWith(snapshotWithEvents);
    expect(html).toContain('data-testid="admin-security-metric-blocks"');
    expect(html).toContain('data-testid="admin-security-metric-peak"');
    expect(html).toContain('data-testid="admin-security-metric-mfa"');
    expect(html).toContain('data-testid="admin-security-metric-hibp"');
    expect(html).toContain("admin.ops.securityMetrics.tileBlocks");
    expect(html).toContain("admin.ops.securityMetrics.peak");
    expect(html).toContain("admin.ops.securityMetrics.mfaFailures");
    expect(html).toContain("admin.ops.securityMetrics.hibpSkipped");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("sm:grid-cols-4");
  });

  it("draws the per-minute chart once there is something to draw", () => {
    const html = renderWith(snapshotWithEvents);
    expect(html).toContain("admin.ops.securityMetrics.chartTitle");
    expect(html).toContain("admin.ops.securityMetrics.series429");
    expect(html).toContain("admin.ops.securityMetrics.seriesDelays");
    expect(html).toContain("<svg");
    expect(html).not.toContain("admin.ops.securityMetrics.empty");
  });

  it("says so instead of drawing an empty chart", () => {
    const html = renderWith(snapshotWithoutEvents);
    expect(html).toContain("admin.ops.securityMetrics.empty");
    expect(html).not.toContain("admin.ops.securityMetrics.chartTitle");
    expect(html).not.toContain('viewBox="0 0 1000 260"');
  });

  it("keeps every readout inside the card — no badge row, no truncation", () => {
    const html = renderWith(snapshotWithEvents);
    // The regression from the live review: badges in a `flex-wrap` row.
    expect(html).not.toContain("data-status-dot");
    expect(html).not.toContain("badge-");
    // Long labels shrink instead of pushing the surface wider.
    expect(html).toContain("min-w-0");
    expect(html).toContain("truncate");
  });
});
