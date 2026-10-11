import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "@/components/ui/toast";
import {
  AdminSecurityPolicyCards,
  AdminBulkPasswordResetCard,
} from "@/components/settings/admin-security-settings-cards";
import type { SettingRegistryEntry } from "@/services/settings-api";

/*
  Paket 5.4.0-e: "Postavke → Sigurnost". The policy card must read the stored
  value (not a default) for the HIBP switch, and the bulk card must always show
  the confirmation entry point — the destructive action itself is a dialog, so
  nothing can run from a stray click.
*/
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "bs", resolvedLanguage: "bs" },
  }),
}));

function entry(key: string, value: boolean | number): SettingRegistryEntry {
  return {
    key,
    description: "",
    categoryId: "private.security",
    categoryIcon: "shield",
    categoryPriority: 1,
    valueType: typeof value === "boolean" ? "boolean" : "number",
    visibility: "private",
    isRequired: false,
    defaultValue: value,
    value,
    isSet: true,
    titleKey: `settings.${key}.title`,
    helpKey: `settings.${key}.help`,
    group: null,
    requires: [],
  };
}

function renderPolicy(entries: readonly SettingRegistryEntry[]) {
  return renderToStaticMarkup(
    <AdminSecurityPolicyCards
      entries={entries}
      canWrite
      pendingKey={null}
      onSave={() => Promise.reject(new Error("not used in this spec"))}
    />,
  );
}

describe("AdminSecurityPolicyCards", () => {
  it("shows the HIBP switch as on when the stored value is on", () => {
    const html = renderPolicy([
      entry("private.security.hibp.enabled", true),
      entry("private.security.session.idleTimeoutSeconds", 0),
    ]);
    expect(html).toContain("admin.security.sessionTitle");
    expect(html).toContain("admin.security.hibpTitle");
    expect(html).toContain("admin.security.sessionRememberNote");
    expect(html).toContain("settings.security.enabled");
    expect(html).not.toContain("settings.security.disabled");
  });

  it("shows the HIBP switch as off and leaves the session row off without a stored key", () => {
    const html = renderPolicy([entry("private.security.hibp.enabled", false)]);
    expect(html).toContain("settings.security.disabled");
    expect(html).not.toContain("settings.security.enabled");
  });
});

describe("AdminBulkPasswordResetCard", () => {
  it("explains the effect and offers the confirmed action", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AdminBulkPasswordResetCard />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("admin.security.bulkTitle");
    expect(html).toContain("admin.security.bulkBody");
    expect(html).toContain("admin.security.bulkAction");
    // No result and no error before the action has run.
    expect(html).not.toContain("admin-bulk-result");
  });
});
