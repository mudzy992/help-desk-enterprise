import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AdminSecurityRateLimitsCard,
  findOutOfBoundsRateLimit,
  groupSummary,
  isValidRateLimitsReason,
  minimumReasonLength,
} from "@/components/admin/security-rate-limits-card";
import type {
  SecurityRateLimitBounds,
  SecurityRateLimitConfig,
  SecurityRateLimitSnapshot,
} from "@/services/security-api";

/*
  Paket 5.4.0-e.2: the „Ograničenja prijava" card after the review of the live
  surface. Two things are pinned here:

  * the card **reads** — three rows with the live numbers — and never shows an
    edit form of its own (the rule Postavke and dodatci follow everywhere):
    a dialog owns the inputs, and the markup proves there is no `<input` in the
    card body;
  * the batch is only submittable when all eight values are whole numbers
    inside the bound the server enforces and the reason is long enough.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options === undefined ? key : `${key}|${JSON.stringify(options)}`,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));


const config: SecurityRateLimitConfig = {
  accountWindowSeconds: 900,
  accountDelayStartsAfterFailures: 5,
  accountDelayBaseMilliseconds: 1000,
  accountDelayMaxMilliseconds: 30000,
  ipMaxFailures: 30,
  ipWindowSeconds: 900,
  otherMaxFailures: 60,
  otherWindowSeconds: 900,
};

const bounds: SecurityRateLimitBounds = {
  accountWindowSeconds: { min: 60, max: 86400 },
  accountDelayStartsAfterFailures: { min: 1, max: 100 },
  accountDelayBaseMilliseconds: { min: 100, max: 60000 },
  accountDelayMaxMilliseconds: { min: 100, max: 600000 },
  ipMaxFailures: { min: 1, max: 10000 },
  ipWindowSeconds: { min: 60, max: 86400 },
  otherMaxFailures: { min: 1, max: 10000 },
  otherWindowSeconds: { min: 60, max: 86400 },
};

const snapshot: SecurityRateLimitSnapshot = { config, bounds };

function renderWithSnapshot(data?: SecurityRateLimitSnapshot) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data !== undefined) {
    client.setQueryData(["admin", "security", "rate-limits"], data);
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AdminSecurityRateLimitsCard />
    </QueryClientProvider>,
  );
}

describe("findOutOfBoundsRateLimit", () => {
  it("accepts the current configuration", () => {
    expect(findOutOfBoundsRateLimit(config, bounds)).toBeNull();
  });

  it("flags a value under the minimum and one over the maximum", () => {
    expect(findOutOfBoundsRateLimit({ ...config, ipMaxFailures: 0 }, bounds)).toBe("ipMaxFailures");
    expect(findOutOfBoundsRateLimit({ ...config, accountDelayMaxMilliseconds: 600_001 }, bounds)).toBe(
      "accountDelayMaxMilliseconds",
    );
  });

  it("flags a value that is not a whole number", () => {
    expect(findOutOfBoundsRateLimit({ ...config, accountWindowSeconds: 900.5 }, bounds)).toBe(
      "accountWindowSeconds",
    );
    expect(findOutOfBoundsRateLimit({ ...config, ipMaxFailures: Number.NaN }, bounds)).toBe("ipMaxFailures");
  });
});

describe("isValidRateLimitsReason", () => {
  it("requires the server minimum after trimming", () => {
    expect(isValidRateLimitsReason("    ")).toBe(false);
    expect(isValidRateLimitsReason("ab")).toBe(false);
    expect(isValidRateLimitsReason("a".repeat(minimumReasonLength - 1))).toBe(false);
    expect(isValidRateLimitsReason(`  ${"a".repeat(minimumReasonLength)}  `)).toBe(true);
  });

  it("mirrors the server maximum of 500 characters", () => {
    expect(isValidRateLimitsReason("a".repeat(500))).toBe(true);
    expect(isValidRateLimitsReason("a".repeat(501))).toBe(false);
  });
});

describe("groupSummary", () => {
  const t = ((key: string, options?: Record<string, unknown>) =>
    options === undefined ? key : `${key}|${JSON.stringify(options)}`) as never;

  it("carries the live numbers of every group", () => {
    expect(groupSummary("account", config, t)).toContain('"failures":5');
    expect(groupSummary("account", config, t)).toContain('"base":1000');
    expect(groupSummary("ip", config, t)).toContain('"failures":30');
    expect(groupSummary("other", config, t)).toContain('"window":900');
  });
});

describe("AdminSecurityRateLimitsCard", () => {
  it("shows the three groups with their current numbers", () => {
    const html = renderWithSnapshot(snapshot);
    expect(html).toContain("admin.security.rateLimitsTitle");
    expect(html).toContain("admin.security.rateLimitGroupAccount");
    expect(html).toContain("admin.security.rateLimitGroupIp");
    expect(html).toContain("admin.security.rateLimitGroupOther");
    expect(html).toContain("admin.security.rateLimitSummaryIp");
    expect(html).toContain('data-testid="admin-rate-limit-group-account"');
  });

  it("never renders an edit form inside the card", () => {
    const html = renderWithSnapshot(snapshot);
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
    // The dialog edits, the card only points at it.
    expect(html).toContain("lucide-chevron-right");
  });

  it("asks the server before the numbers are known", () => {
    const html = renderWithSnapshot();
    expect(html).toContain("admin.security.rateLimitsLoading");
    expect(html).not.toContain("admin.security.rateLimitGroupIp");
  });

  it("offers a refresh that does not submit anything", () => {
    const html = renderWithSnapshot(snapshot);
    expect(html).toContain("admin.security.rateLimitsRefresh");
    expect(html).not.toContain("admin.security.rateLimitsSave");
  });
});
