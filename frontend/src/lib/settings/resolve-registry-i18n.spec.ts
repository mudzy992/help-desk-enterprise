import { beforeAll, describe, expect, it } from "vitest";
import { initializeI18n, i18n } from "@/i18n/config";
import {
  resolveRegistryCategoryTitle,
  resolveRegistryDescription,
} from "@/lib/settings/resolve-registry-i18n";

/** One representative key per category (first two segments of the setting key). */
const SAMPLE_BY_CATEGORY = {
  "private.addons": "private.addons.sla",
  "private.audit": "private.audit.export.enabled",
  "private.auth": "private.auth.mode",
  "private.changeLog": "private.changeLog.requireReason",
  "private.configVersioning": "private.configVersioning.enabled",
  "private.csat": "private.csat.enabled",
  "private.dashboard": "private.dashboard.bottlenecks.enabled",
  "private.dataLifecycle": "private.dataLifecycle.archive.enabled",
  "private.edgeExtension": "private.edgeExtension.enabled",
  "private.guardrails": "private.guardrails.antiLoop.enabled",
  "private.install": "private.install.completedAt",
  "private.integrations": "private.integrations.queue.enabled",
  "private.knowledgeBase": "private.knowledgeBase.reviewCycle.enabled",
  "private.notifications": "private.notifications.email.enabled",
  "private.observability": "private.observability.supportBundle.enabled",
  "private.readOnlyMode": "private.readOnlyMode.enabled",
  "private.reports": "private.reports.enabled",
  "private.security": "private.security.redaction.enabled",
  "private.services": "private.services.lifecycle.enabled",
  "private.smtp": "private.smtp.enabled",
  "private.ticket": "private.ticket.sla.enabled",
  "private.workflow": "private.workflow.requiredFields.enabled",
  "public.branding": "public.branding.appName",
  "public.maintenance": "public.maintenance.enabled",
} as const;

describe("resolveRegistry i18n catalogs", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  it.each(Object.entries(SAMPLE_BY_CATEGORY))(
    "BS: category %s and key %s resolve without fallback",
    async (categoryKey, settingKey) => {
      await i18n.changeLanguage("bs");
      const title = resolveRegistryCategoryTitle(i18n.t.bind(i18n), categoryKey);
      const description = resolveRegistryDescription(
        i18n.t.bind(i18n),
        settingKey,
        "BACKEND_FALLBACK",
      );
      expect(title).not.toBe(categoryKey);
      expect(title.length).toBeGreaterThan(0);
      expect(description).not.toBe("BACKEND_FALLBACK");
      expect(description.length).toBeGreaterThan(0);
    },
  );

  it.each(Object.entries(SAMPLE_BY_CATEGORY))(
    "EN: category %s and key %s resolve without fallback",
    async (categoryKey, settingKey) => {
      await i18n.changeLanguage("en");
      const title = resolveRegistryCategoryTitle(i18n.t.bind(i18n), categoryKey);
      const description = resolveRegistryDescription(
        i18n.t.bind(i18n),
        settingKey,
        "BACKEND_FALLBACK",
      );
      expect(title).not.toBe(categoryKey);
      expect(title.length).toBeGreaterThan(0);
      expect(description).not.toBe("BACKEND_FALLBACK");
      expect(description.length).toBeGreaterThan(0);
    },
  );

  it("covers every category with a sample key", () => {
    expect(Object.keys(SAMPLE_BY_CATEGORY)).toHaveLength(24);
  });
});
