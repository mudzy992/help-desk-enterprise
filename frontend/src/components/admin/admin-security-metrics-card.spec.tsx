import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityMetricsCard } from "@/components/admin/admin-security-metrics-card";

/*
  Paket 5.4.0-e: the Nadzor security card renders the loading state first — the
  spec pins that the title and the refresh affordance exist before any data
  arrives, so an empty or slow Redis never leaves a blank surface.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

describe("AdminSecurityMetricsCard", () => {
  it("renders the card header and the loading state without a cache entry", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AdminSecurityMetricsCard />
      </QueryClientProvider>,
    );
    expect(html).toContain("admin.ops.securityMetrics.title");
    expect(html).toContain("admin.ops.securityMetrics.body");
    expect(html).toContain("admin.ops.securityMetrics.refresh");
    expect(html).toContain("admin.ops.securityMetrics.loading");
  });
});
