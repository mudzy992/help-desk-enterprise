import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSecurityPanel } from "@/components/admin/admin-security-panel";
import { AdminSecurityAuditCard } from "@/components/admin/admin-security-audit-card";

/*
  Paket 5.4.0-d (M6) + 5.4.0-e.2: the two render states that must never leak
  data, plus the ordering of the tab. Both components are rendered without a
  browser, with the translator stubbed to its key so the assertions stay about
  wiring, not wording. The settings block has its own spec; here it is stubbed so
  this file keeps testing the panel's composition and nothing else.
*/
vi.mock("@/components/admin/admin-security-settings-cards", () => ({
  AdminSecuritySettingsCards: () => <div data-testid="settings-cards-stub" />,
}));
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

  /*
    5.4.0-e.2: the SuperAdmin opens „Sigurnost" and must find the settings they
    can change there — the journal first (it explains every change), then the
    administration cards. A profile without the right never mounts them, so a
    deep link by a regular ADMIN cannot fire a single SuperAdmin request.
  */
  it("mounts the security settings cards after the journal for a SuperAdmin", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPanel isLoading={false} session={{ isSuperAdmin: true }} />,
    );
    expect(html).toContain('data-testid="settings-cards-stub"');
    expect(html.indexOf("admin.security.auditTitle")).toBeLessThan(
      html.indexOf('data-testid="settings-cards-stub"'),
    );
  });

  it("never mounts the security settings cards for a regular ADMIN", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPanel isLoading={false} session={{ isSuperAdmin: false }} />,
    );
    expect(html).not.toContain('data-testid="settings-cards-stub"');
  });

  it("does not mount the security settings cards while the session resolves", () => {
    const html = renderToStaticMarkup(<AdminSecurityPanel isLoading session={null} />);
    expect(html).not.toContain('data-testid="settings-cards-stub"');
  });
});
