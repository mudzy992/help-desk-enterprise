import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityPanel } from "@/components/admin/admin-security-panel";
import { AdminSecurityAuditCard } from "@/components/admin/admin-security-audit-card";

/*
  Paket 5.4.0-d (M6): the two render states that must never leak data. Both
  components are rendered without a browser, with the translator stubbed to its
  key so the assertions stay about wiring, not wording.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs" },
  }),
}));

describe("AdminSecurityAuditCard", () => {
  it("shows the forbidden state and no table for a viewer without the right", () => {
    const html = renderToStaticMarkup(<AdminSecurityAuditCard canView={false} />);
    expect(html).toContain("admin.security.forbiddenTitle");
    expect(html).toContain("admin.security.forbiddenBody");
    expect(html).not.toContain("<table");
  });

  it("shows the loading state before the first page arrives", () => {
    const html = renderToStaticMarkup(<AdminSecurityAuditCard canView />);
    expect(html).toContain("admin.security.auditLoading");
    expect(html).not.toContain("<table");
    // The filters are visible so the SuperAdmin knows what can be narrowed.
    expect(html).toContain("admin.security.filterAction");
    expect(html).toContain("admin.security.filterUser");
  });
});

describe("AdminSecurityPanel", () => {
  it("renders the forbidden state for a regular ADMIN that deep-links the tab", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPanel isLoading={false} session={{ isSuperAdmin: false }} />,
    );
    expect(html).toContain("admin.security.forbiddenTitle");
    expect(html).not.toContain("admin.security.auditTitle");
  });

  it("renders the loading state while the session is still resolving", () => {
    const html = renderToStaticMarkup(<AdminSecurityPanel isLoading session={null} />);
    expect(html).toContain("session.loading");
    expect(html).not.toContain("admin.security.forbiddenTitle");
  });

  it("renders the journal for a SuperAdmin", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPanel isLoading={false} session={{ isSuperAdmin: true }} />,
    );
    expect(html).toContain("admin.security.auditTitle");
    expect(html).not.toContain("admin.security.forbiddenTitle");
  });
});
