import { describe, expect, it } from "vitest";
import {
  canOpenAdminSecurityTab,
  resolveSecurityAuditViewState,
  securityActionLabelKey,
} from "@/lib/admin/admin-security-tab";
import { auditActionTranslationKey } from "@/lib/audit/audit-log-i18n";

/*
  Paket 5.4.0-d (M6): the security tab is SuperAdmin-only, and the journal has
  one distinct state per situation. Both predicates are pure so the access rule
  and every state are provable without a browser.
*/
describe("canOpenAdminSecurityTab", () => {
  it("opens for a SuperAdmin only", () => {
    expect(canOpenAdminSecurityTab({ isSuperAdmin: true })).toBe(true);
    expect(canOpenAdminSecurityTab({ isSuperAdmin: false })).toBe(false);
    expect(canOpenAdminSecurityTab({})).toBe(false);
    expect(canOpenAdminSecurityTab(null)).toBe(false);
  });
});

describe("resolveSecurityAuditViewState", () => {
  it("never shows data to a viewer without the right", () => {
    expect(
      resolveSecurityAuditViewState({
        canView: false,
        isLoading: true,
        hasError: true,
        rowCount: 5,
      }),
    ).toEqual({ kind: "forbidden" });
  });

  it("separates loading, empty, error and ready", () => {
    expect(
      resolveSecurityAuditViewState({ canView: true, isLoading: true, hasError: false, rowCount: 0 }),
    ).toEqual({ kind: "loading" });
    expect(
      resolveSecurityAuditViewState({ canView: true, isLoading: false, hasError: false, rowCount: 0 }),
    ).toEqual({ kind: "empty" });
    expect(
      resolveSecurityAuditViewState({ canView: true, isLoading: false, hasError: true, rowCount: 0 }),
    ).toEqual({ kind: "error", hasRows: false });
    expect(
      resolveSecurityAuditViewState({ canView: true, isLoading: false, hasError: false, rowCount: 3 }),
    ).toEqual({ kind: "ready" });
  });

  it("keeps the loaded rows visible when loading another page fails", () => {
    expect(
      resolveSecurityAuditViewState({ canView: true, isLoading: false, hasError: true, rowCount: 3 }),
    ).toEqual({ kind: "error", hasRows: true });
  });
});

describe("securityActionLabelKey", () => {
  it("uses the translated label for a known action", () => {
    expect(
      securityActionLabelKey(auditActionTranslationKey("auth.login_failed")),
    ).toBe("admin.ops.auditLog.labels.actions.auth_login_failed");
  });

  it("falls back to a generic label for an unknown historical action", () => {
    expect(
      securityActionLabelKey(auditActionTranslationKey("auth.future_event")),
    ).toBe("admin.security.unknownAction");
  });
});
