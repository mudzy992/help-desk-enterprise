import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AdminBulkPasswordResetCard,
  AdminSecurityPolicyCards,
} from "@/components/admin/admin-security-settings-cards";
import type { SettingRegistryEntry } from "@/services/settings-api";

/*
  Paket 5.4.0-e.2: the SuperAdmin found the admin „Sigurnost" tab showing only
  the journal. Two guarantees follow from that review:

  * the policy surfaces are **rows**, grouped by what an administrator is
    looking for (session policy, breached-password check), and the card itself
    holds no form field — the existing `SettingsCategoryDialog` edits them with
    the reason and the dependency gates every other Postavke value goes through;
  * a row reports whether the feature is on, read from the registry entry that
    actually decides it, never from a local guess.
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

// The confirmation has its own spec (and needs a query client for the passkey
// availability); here it only has to be reachable, so it is a marker.
vi.mock("@/components/auth/identity-confirm-dialog", () => ({
  IdentityConfirmDialog: ({ open, passkeyPurpose }: { open: boolean; passkeyPurpose: string }) => (
    <div
      data-testid="identity-confirm"
      data-open={open ? "true" : "false"}
      data-purpose={passkeyPurpose}
    />
  ),
}));

// The dialog edits through its own spec'd component; here it only has to receive
// the right rows, so it is reduced to a marker that carries them.
vi.mock("@/components/settings/settings-category-dialog", () => ({
  SettingsCategoryDialog: ({
    open,
    entries,
  }: {
    open: boolean;
    entries: readonly { key: string }[];
  }) => (
    <div
      data-testid="category-dialog"
      data-open={open ? "true" : "false"}
      data-keys={entries.map((entry) => entry.key).join(",")}
    />
  ),
}));

function entry(key: string, value: string | boolean, isSet = true): SettingRegistryEntry {
  return {
    key,
    value,
    valueType: typeof value === "boolean" ? "boolean" : "string",
    category: "security",
    visibility: "private",
    isSet,
    requires: [],
    blocks: [],
    dependents: [],
    updatedAt: "2026-10-12T08:00:00.000Z",
    updatedBy: null,
  } as unknown as SettingRegistryEntry;
}

const entries: readonly SettingRegistryEntry[] = [
  entry("private.security.session.idleTimeoutMinutes", "60"),
  entry("private.security.session.maxMinutes", "0"),
  entry("private.security.hibp.enabled", false),
  entry("private.security.redaction.enabled", "true"),
];

const captchaProviderKey = "private.security.captcha.provider";

const noop = vi.fn(async () => ({ changed: [], reset: [] }) as never);

describe("AdminSecurityPolicyCards", () => {
  it("lists one row per policy surface with its live state", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPolicyCards entries={entries} canWrite pendingKey={null} onSave={noop} />,
    );
    expect(html).toContain('data-testid="admin-security-policy-row-session"');
    expect(html).toContain('data-testid="admin-security-policy-row-hibp"');
    // 5.4.1 (M3): the human check is a policy surface too.
    expect(html).toContain('data-testid="admin-security-policy-row-captcha"');
    // 5.4.2 (stavka 3): the audit webhook export is a fourth row, same dialog.
    expect(html).toContain('data-testid="admin-security-policy-row-webhook"');
    expect(html).toContain("admin.security.auditWebhookRow");
    expect(html).toContain("admin.security.captchaRow");
    // 5.4.0-e.3: the card holds two groups, so its title covers both rows.
    expect(html).toContain("admin.security.policyTitle");
    expect(html).toContain("admin.security.policyBody");
    expect(html).toContain("admin.security.sessionPolicyRow");
    expect(html).toContain("admin.security.hibpTitle");
    // HIBP is off in the registry, the session policy has values set.
    expect(html).toContain("settings.security.disabled");
    expect(html).toContain("settings.security.enabled");
  });

  it("never renders an edit form inside the card", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPolicyCards entries={entries} canWrite pendingKey={null} onSave={noop} />,
    );
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("settings.registry.saving");
    // Rows point at the dialog; the dialog is closed until a row is chosen.
    expect(html).toContain('data-open="false"');
    expect(html).toContain('data-keys=""');
  });

  it("hands the dialog only the rows of the chosen surface", () => {
    const sessionOnly = renderToStaticMarkup(
      <AdminSecurityPolicyCards
        entries={entries}
        canWrite={false}
        pendingKey={null}
        onSave={noop}
      />,
    );
    // Nothing leaks into the initial render, not even for a read-only viewer.
    expect(sessionOnly).not.toContain("private.security.redaction.enabled");
    expect(sessionOnly).toContain("admin.security.policyBody");
  });

  it("reports the human check as on only when the provider is turnstile", () => {
    // No captcha entry in the registry yet: `none` is the default, so the row
    // must not promise a check that is not running.
    const off = renderToStaticMarkup(
      <AdminSecurityPolicyCards entries={entries} canWrite pendingKey={null} onSave={noop} />,
    );
    expect(off).toContain("admin.security.captchaHint");
    expect(off.match(/settings\.security\.enabled/g) ?? []).toHaveLength(1);

    const on = renderToStaticMarkup(
      <AdminSecurityPolicyCards
        entries={[...entries, entry(captchaProviderKey, "turnstile")]}
        canWrite
        pendingKey={null}
        onSave={noop}
      />,
    );
    expect((on.match(/settings\.security\.enabled/g) ?? []).length).toBe(
      (off.match(/settings\.security\.enabled/g) ?? []).length + 1,
    );
  });

  it("ignores the redaction switch — it belongs to Usklađenost", () => {
    const html = renderToStaticMarkup(
      <AdminSecurityPolicyCards entries={entries} canWrite pendingKey={null} onSave={noop} />,
    );
    expect(html).not.toContain("private.security.redaction.enabled");
  });
});

describe("AdminBulkPasswordResetCard", () => {
  it("explains the action and keeps it behind a confirmation", () => {
    const html = renderToStaticMarkup(<AdminBulkPasswordResetCard />);
    expect(html).toContain("admin.security.bulkTitle");
    expect(html).toContain("admin.security.bulkBody");
    expect(html).toContain("admin.security.bulkAction");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("admin.security.bulkDone");
  });

  it("never shows a result before the action ran", () => {
    const html = renderToStaticMarkup(<AdminBulkPasswordResetCard />);
    expect(html).not.toContain('data-testid="admin-bulk-result"');
  });
});
