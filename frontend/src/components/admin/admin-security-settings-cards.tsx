import { Fingerprint, Send, ShieldAlert, ShieldCheck, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IdentityConfirmDialog } from "@/components/auth/identity-confirm-dialog";
import { AdminSecurityRateLimitsCard } from "@/components/admin/security-rate-limits-card";
import { SettingsCategoryDialog } from "@/components/settings/settings-category-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import {
  filterSettingsByPrefix,
  readBooleanSetting,
  readStringSetting,
} from "@/lib/settings/read-setting-entry";
import type { SettingsSaver } from "@/lib/settings/use-settings-registry";
import { useSettingsRegistry } from "@/lib/settings/use-settings-registry";
import { ApiError } from "@/services/api";
import { bulkPasswordReset, identityStepUpPurpose } from "@/services/security-api";
import type { SettingRegistryEntry } from "@/services/settings-api";

/**
 * Paket 5.4.0-e (M2/M4) / 5.4.0-e.2 (UI polish): the administration block of the
 * „Sigurnost" tab — the place a SuperAdmin looks for security, right next to the
 * journal. It keeps the product's editing pattern:
 *
 * * „Ograničenja prijava" rows open a dialog (one batch, one reason, identity proof);
 * * „Politika sesija", „HIBP provjera lozinki" and „Provjera da niste robot" (5.4.1)
 *   list the registry keys and open
 *   `SettingsCategoryDialog`, so a value is edited exactly like anywhere else in
 *   Postavke (reason, dependency gate, audit) — never inline in the card;
 * * „Prisilna promjena svih lokalnih lozinki" is a confirmed batch action.
 */
export function AdminSecuritySettingsCards({ isSuperAdmin }: { readonly isSuperAdmin: boolean }) {
  const registry = useSettingsRegistry();
  const canWrite = isSuperAdmin;

  return (
    <div className="flex flex-col gap-4">
      {registry.errorKey !== null && registry.entries.length === 0 ? (
        <ApiErrorText messageKey={registry.errorKey} />
      ) : null}
      {isSuperAdmin ? <AdminSecurityRateLimitsCard /> : null}
      <AdminSecurityPolicyCards
        entries={registry.entries}
        canWrite={canWrite}
        pendingKey={registry.pendingKey}
        onSave={registry.save}
      />
      {isSuperAdmin ? <AdminBulkPasswordResetCard /> : null}
    </div>
  );
}

const sessionPolicyPrefix = "private.security.session.";
const hibpPrefix = "private.security.hibp.";
const hibpEnabledKey = "private.security.hibp.enabled";
// 5.4.1: the human check is a setting, not a deployment switch — `none` is the
// default, and the row reports the provider the limiter actually reads.
const captchaPrefix = "private.security.captcha.";
const captchaProviderKey = "private.security.captcha.provider";
const captchaEnabledValue = "turnstile";
// 5.4.2 (stavka 3): the signed audit export. Same dialog as the other rows: the
// secret, the dependency gate (switch on only with an address and a secret) and
// the reason all come from the registry, not from this card.
const auditWebhookPrefix = "private.security.auditWebhook.";
const auditWebhookEnabledKey = "private.security.auditWebhook.enabled";

const rowDescriptionKeys = {
  session: "admin.security.sessionBody",
  hibp: "admin.security.hibpBody",
  captcha: "admin.security.captchaBody",
  webhook: "admin.security.auditWebhookBody",
} as const;

export function AdminSecurityPolicyCards({
  entries,
  canWrite,
  pendingKey,
  onSave,
}: {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: SettingsSaver;
}) {
  const { t } = useTranslation();
  const [openRow, setOpenRow] = useState<"session" | "hibp" | "captcha" | "webhook" | null>(null);
  const auditWebhookEnabled = readBooleanSetting(entries, auditWebhookEnabledKey, false);
  const hibpEnabled = readBooleanSetting(entries, hibpEnabledKey, true);
  const captchaEnabled = readStringSetting(entries, captchaProviderKey, "none") === captchaEnabledValue;
  const rows = useMemo(
    () => [
      {
        id: "session" as const,
        icon: Timer,
        label: t("admin.security.sessionPolicyRow"),
        hint: t("admin.security.sessionRememberNote"),
        enabled: filterSettingsByPrefix(entries, sessionPolicyPrefix).some((entry) => entry.isSet),
        prefixes: [sessionPolicyPrefix],
      },
      {
        id: "hibp" as const,
        icon: ShieldAlert,
        label: t("admin.security.hibpTitle"),
        hint: t("admin.security.hibpHint"),
        enabled: hibpEnabled,
        prefixes: [hibpPrefix],
      },
      {
        id: "captcha" as const,
        icon: ShieldCheck,
        label: t("admin.security.captchaRow"),
        hint: t("admin.security.captchaHint"),
        enabled: captchaEnabled,
        prefixes: [captchaPrefix],
      },
      {
        id: "webhook" as const,
        icon: Send,
        label: t("admin.security.auditWebhookRow"),
        hint: t("admin.security.auditWebhookHint"),
        enabled: auditWebhookEnabled,
        prefixes: [auditWebhookPrefix],
      },
    ],
    [auditWebhookEnabled, captchaEnabled, entries, hibpEnabled, t],
  );
  const activeRow = rows.find((row) => row.id === openRow) ?? null;
  const drawerEntries = useMemo(
    () =>
      activeRow === null
        ? []
        : activeRow.prefixes.flatMap((prefix) => filterSettingsByPrefix(entries, prefix)),
    [activeRow, entries],
  );

  return (
    <>
      <Card className="fade-in" data-testid="admin-security-policy-card">
        {/* 5.4.0-e.3: the card holds the session policy *and* the breached-password
            check, so its title names the group instead of only the first row. */}
        <CardHeader
          title={t("admin.security.policyTitle")}
          subtitle={t("admin.security.policyBody")}
        />
        <div className="space-y-2 px-4 py-4">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              data-testid={`admin-security-policy-row-${row.id}`}
              className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
              onClick={() => setOpenRow(row.id)}
            >
              <row.icon size={14} className={row.enabled ? "text-ok" : "text-muted-foreground"} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-foreground/90">{row.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{row.hint}</span>
              </span>
              <Badge tone={row.enabled ? "success" : "neutral"} dot={false}>
                {row.enabled ? t("settings.security.enabled") : t("settings.security.disabled")}
              </Badge>
            </button>
          ))}
        </div>
      </Card>
      <SettingsCategoryDialog
        open={openRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenRow(null);
          }
        }}
        title={activeRow?.label ?? t("admin.security.policyTitle")}
        description={activeRow === null ? undefined : t(rowDescriptionKeys[activeRow.id])}
        entries={drawerEntries}
        allEntries={entries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onSave={onSave}
      />
    </>
  );
}

export function AdminBulkPasswordResetCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const run = async (code?: string) => {
    try {
      const response = await bulkPasswordReset(code === undefined ? undefined : { code });
      setErrorKey(null);
      const summary = t("admin.security.bulkDone", {
        eligible: response.eligibleUsers,
        changed: response.changedUsers,
        revoked: response.revokedSessions,
      });
      setResult(
        response.failedUsers > 0
          ? `${summary} ${t("admin.security.bulkPartial", { failed: response.failedUsers })}`
          : summary,
      );
      toast({ tone: "success", title: t("admin.security.bulkDoneToast") });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw error;
      }
      setErrorKey(mapApiError(error));
    }
  };

  return (
    <Card className="fade-in" data-testid="admin-bulk-password-reset-card">
      <CardHeader title={t("admin.security.bulkTitle")} subtitle={t("admin.security.bulkBody")} />
      <div className="space-y-3 px-4 py-4">
        {errorKey ? <ApiErrorText messageKey={errorKey} /> : null}
        {result !== null ? (
          <p className="text-[12.5px] leading-5 text-foreground/90" data-testid="admin-bulk-result">
            {result}
          </p>
        ) : null}
        <Button type="button" variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
          <Fingerprint size={13} />
          {t("admin.security.bulkAction")}
        </Button>
      </div>
      <IdentityConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("admin.security.bulkConfirmTitle")}
        description={t("admin.security.bulkConfirmBody")}
        submitLabel={t("admin.security.bulkAction")}
        passkeyPurpose={identityStepUpPurpose.bulkPasswordReset}
        onSubmit={run}
      />
    </Card>
  );
}
