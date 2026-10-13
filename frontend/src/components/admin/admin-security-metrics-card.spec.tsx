import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityMetricsCard } from "@/components/admin/admin-security-metrics-card";
import type { LoginSecurityMetricsSnapshot, SecurityAuditWebhookStatus } from "@/services/security-api";

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

function renderWith(snapshot?: LoginSecurityMetricsSnapshot, webhook?: SecurityAuditWebhookStatus) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (snapshot !== undefined) {
    client.setQueryData(["admin", "security", "metrics", "last-hour"], snapshot);
  }
  if (webhook !== undefined) {
    client.setQueryData(["admin", "security", "metrics", "audit-webhook"], webhook);
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
    // 5.4.1: the endpoint reports the challenge counters too; the card draws the
    // four series above, so these two only have to be part of the payload.
    "captcha-skipped": series(1, 1, [0, 1, 0, 0]),
    "captcha-failed": series(0, 0, [0, 0, 0, 0]),
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
    "captcha-skipped": series(0, 0, [0, 0, 0, 0]),
    "captcha-failed": series(0, 0, [0, 0, 0, 0]),
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

  it("shows the counters, captcha included, as grid tiles with their numbers", () => {
    const html = renderWith(snapshotWithEvents);
    // Paket 5.4.2 (stavka 2): the two captcha counters are tiles too, in three columns on wide screens.
    expect(html).toContain('data-testid="admin-security-metric-captcha-failed"');
    expect(html).toContain('data-testid="admin-security-metric-captcha-skipped"');
    expect(html).toContain("admin.ops.securityMetrics.captchaFailed");
    expect(html).toContain("admin.ops.securityMetrics.captchaSkipped");
    expect(html).toContain('data-testid="admin-security-metric-blocks"');
    expect(html).toContain('data-testid="admin-security-metric-peak"');
    expect(html).toContain('data-testid="admin-security-metric-mfa"');
    expect(html).toContain('data-testid="admin-security-metric-hibp"');
    expect(html).toContain("admin.ops.securityMetrics.tileBlocks");
    expect(html).toContain("admin.ops.securityMetrics.peak");
    expect(html).toContain("admin.ops.securityMetrics.mfaFailures");
    expect(html).toContain("admin.ops.securityMetrics.hibpSkipped");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("sm:grid-cols-3");
  });

  it("draws the per-minute hour as bar strips once there is something to draw", () => {
    const html = renderWith(snapshotWithEvents);
    expect(html).toContain("admin.ops.securityMetrics.chartTitle");
    expect(html).toContain("admin.ops.securityMetrics.series429");
    expect(html).toContain("admin.ops.securityMetrics.seriesDelays");
    // The live review replaced the area chart: with one label per minute its
    // axis row was wider than the card and scrolled the page sideways.
    expect(html).not.toContain("preserveAspectRatio");
    expect(html).toContain("a11y.chart.barsHint");
    expect(html).not.toContain("admin.ops.securityMetrics.empty");
  });

  it("says so instead of drawing an empty chart", () => {
    const html = renderWith(snapshotWithoutEvents);
    expect(html).toContain("admin.ops.securityMetrics.empty");
    expect(html).not.toContain("admin.ops.securityMetrics.chartTitle");
    expect(html).not.toContain("a11y.chart.barsHint");
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

  // Paket 5.4.2 (stavka 4): the export tile is a full-width row with its own state word.
  it("shows the audit webhook export state as a full-width row under the tiles", () => {
    const ok: SecurityAuditWebhookStatus = {
      state: "ok",
      pendingSince: null,
      pendingMinutes: null,
      sentTotal: 40,
      failedTotal: 2,
      droppedTotal: 0,
      lastSuccessAt: "2026-10-13T09:58:00.000Z",
      lastErrorCode: null,
      generatedAt: "2026-10-13T10:00:00.000Z",
    };
    const html = renderWith(snapshotWithEvents, ok);
    expect(html).toContain('data-testid="admin-security-metric-webhook"');
    expect(html).toContain('data-state="ok"');
    expect(html).toContain("admin.ops.securityMetrics.webhook.stateOk");
    expect(html).toContain("admin.ops.securityMetrics.webhook.totals");
    expect(html).toContain("admin.ops.securityMetrics.webhook.lastSuccess");
  });

  it("names the failing streak and its last error code, never the address", () => {
    const failing: SecurityAuditWebhookStatus = {
      state: "failing",
      pendingSince: "2026-10-13T09:30:00.000Z",
      pendingMinutes: 30,
      sentTotal: 40,
      failedTotal: 9,
      droppedTotal: 0,
      lastSuccessAt: null,
      lastErrorCode: "HTTP_500",
      generatedAt: "2026-10-13T10:00:00.000Z",
    };
    const html = renderWith(snapshotWithoutEvents, failing);
    expect(html).toContain('data-state="failing"');
    expect(html).toContain("admin.ops.securityMetrics.webhook.stateFailing");
    expect(html).toContain("admin.ops.securityMetrics.webhook.failingSince");
    expect(html).toContain("admin.ops.securityMetrics.webhook.noSuccess");
    expect(html).toContain("HTTP_500");
    // Only the tile itself: the refresh icon above carries an xmlns URL of its own.
    const tile = html.slice(html.indexOf('data-testid="admin-security-metric-webhook"'));
    expect(tile).not.toMatch(/https?:\/\//);
  });

  it("says the export is off without showing counters that do not apply", () => {
    const off: SecurityAuditWebhookStatus = {
      state: "disabled",
      pendingSince: null,
      pendingMinutes: null,
      sentTotal: 0,
      failedTotal: 0,
      droppedTotal: 0,
      lastSuccessAt: null,
      lastErrorCode: null,
      generatedAt: "2026-10-13T10:00:00.000Z",
    };
    const html = renderWith(snapshotWithoutEvents, off);
    expect(html).toContain("admin.ops.securityMetrics.webhook.stateDisabled");
    expect(html).not.toContain("admin.ops.securityMetrics.webhook.totals");
    expect(html).not.toContain("admin.ops.securityMetrics.webhook.noSuccess");
  });
});
