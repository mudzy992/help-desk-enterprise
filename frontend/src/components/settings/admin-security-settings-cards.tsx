import { Fingerprint, KeyRound, ShieldAlert, Timer } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { IdentityConfirmDialog } from "@/components/auth/identity-confirm-dialog";
import { SettingsCategoryDialog } from "@/components/settings/settings-category-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";
import { useToast } from "@/components/ui/toast";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { filterSettingsByPrefix, readBooleanSetting } from "@/lib/settings/read-setting-entry";
import type { SettingsSaver } from "@/lib/settings/use-settings-registry";
import { ApiError } from "@/services/api";
import {
  bulkPasswordReset,
  getSecurityRateLimits,
  identityStepUpPurpose,
  updateSecurityRateLimits,
  type SecurityRateLimitConfig,
} from "@/services/security-api";
import type { SettingRegistryEntry } from "@/services/settings-api";

/**
 * Paket 5.4.0-e: the "Postavke → Sigurnost" administration block.
 *
 * The four cards sit next to the existing "Sigurnost" feature card:
 * - "Ograničenja prijava" retunes the eight limiter scalars in one journalled
 *   batch (a reason is mandatory) and needs a proof of identity — a current
 *   code or a fresh passkey step-up for this purpose;
 * - "Politika sesija" and "HIBP provjera lozinki" edit the registry keys
 *   through the ordinary settings writer (reason + audit come with it);
 * - "Prisilna promjena svih lozinki" is the bulk reset: every local account
 *   must change its password and loses its sessions.
 *
 * The form mirrors the server's bounds (`bounds` from GET) so a mistyped value
 * is caught before the request; the server still validates everything again.
 */

const rateLimitFields = [
  "accountWindowSeconds",
  "accountDelayStartsAfterFailures",
  "accountDelayBaseMilliseconds",
  "accountDelayMaxMilliseconds",
  "ipMaxFailures",
  "ipWindowSeconds",
  "otherMaxFailures",
  "otherWindowSeconds",
] as const;

const rateLimitLabelKeys = {
  accountWindowSeconds: "admin.security.rateLimitAccountWindowSeconds",
  accountDelayStartsAfterFailures: "admin.security.rateLimitAccountDelayStartsAfterFailures",
  accountDelayBaseMilliseconds: "admin.security.rateLimitAccountDelayBaseMilliseconds",
  accountDelayMaxMilliseconds: "admin.security.rateLimitAccountDelayMaxMilliseconds",
  ipMaxFailures: "admin.security.rateLimitIpMaxFailures",
  ipWindowSeconds: "admin.security.rateLimitIpWindowSeconds",
  otherMaxFailures: "admin.security.rateLimitOtherMaxFailures",
  otherWindowSeconds: "admin.security.rateLimitOtherWindowSeconds",
} as const;

const sessionPolicyPrefix = "private.security.session.";
const hibpPrefix = "private.security.hibp.";
const hibpEnabledKey = "private.security.hibp.enabled";
const minimumReasonLength = 5;

export function AdminLoginRateLimitsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const snapshot = useQuery({ queryKey: ["admin", "security", "rate-limits"], queryFn: getSecurityRateLimits });
  const [draft, setDraft] = useState<SecurityRateLimitConfig | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);

  useEffect(() => {
    if (snapshot.data && draft === null) {
      setDraft(snapshot.data.config);
    }
  }, [snapshot.data, draft]);

  const bounds = snapshot.data?.bounds;
  const isOutOfBounds =
    draft === null || bounds === undefined
      ? true
      : rateLimitFields.some((field) => {
          const value = draft[field];
          const bound = bounds[field];
          return !Number.isInteger(value) || value < bound.min || value > bound.max;
        });
  const canSubmit =
    draft !== null && !isOutOfBounds && reason.trim().length >= minimumReasonLength;

  const save = useMutation({
    mutationFn: (code?: string) =>
      updateSecurityRateLimits({ config: draft as SecurityRateLimitConfig, reason: reason.trim(), code }),
    onSuccess: () => {
      setErrorKey(null);
      setReason("");
      toast({ tone: "success", title: t("admin.security.rateLimitsSaved") });
      void queryClient.invalidateQueries({ queryKey: ["admin", "security", "rate-limits"] });
    },
  });

  const runSave = async (code?: string) => {
    try {
      await save.mutateAsync(code);
    } catch (error) {
      // A missing or wrong second factor belongs to the code field inside the
      // dialog; everything else is about the values and is shown on the card.
      if (error instanceof ApiError && error.status === 401) {
        throw error;
      }
      setErrorKey(mapApiError(error));
    }
  };

  return (
    <Card className="fade-in" data-testid="admin-rate-limits-card">
      <CardHeader
        title={t("admin.security.rateLimitsTitle")}
        subtitle={t("admin.security.rateLimitsBody")}
      />
      <div className="space-y-3 px-4 py-4">
        {snapshot.isLoading ? (
          <p className={hintClassName}>{t("admin.security.rateLimitsLoading")}</p>
        ) : null}
        {snapshot.isError ? <ApiErrorText messageKey={mapApiError(snapshot.error)} /> : null}
        {errorKey ? <ApiErrorText messageKey={errorKey} /> : null}
        {draft !== null && bounds !== undefined ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rateLimitFields.map((field) => (
                <label key={field} className={labelClassName}>
                  <span>{t(rateLimitLabelKeys[field])}</span>
                  <input
                    className={controlClassName}
                    type="number"
                    inputMode="numeric"
                    min={bounds[field].min}
                    max={bounds[field].max}
                    value={draft[field]}
                    onChange={(event) =>
                      setDraft({ ...draft, [field]: Number(event.target.value) })
                    }
                  />
                  <span className={hintClassName}>
                    {t("admin.security.rateLimitsBounds", {
                      min: bounds[field].min,
                      max: bounds[field].max,
                    })}
                  </span>
                </label>
              ))}
            </div>
            <label className={labelClassName}>
              <span>{t("admin.security.rateLimitsReason")}</span>
              <input
                className={controlClassName}
                type="text"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("admin.security.rateLimitsReasonPlaceholder")}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit || save.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                <KeyRound size={13} />
                {save.isPending ? t("settings.registry.saving") : t("admin.security.rateLimitsSave")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void snapshot.refetch()}
              >
                {t("admin.security.rateLimitsRefresh")}
              </Button>
            </div>
          </>
        ) : null}
      </div>
      <IdentityConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("admin.security.rateLimitsConfirmTitle")}
        description={t("admin.security.rateLimitsConfirmBody")}
        submitLabel={t("admin.security.rateLimitsSave")}
        passkeyPurpose={identityStepUpPurpose.rateLimits}
        onSubmit={runSave}
      />
    </Card>
  );
}

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
  const [openRow, setOpenRow] = useState<"session" | "hibp" | null>(null);
  const hibpEnabled = readBooleanSetting(entries, hibpEnabledKey, true);
  const rows = useMemo(
    () => [
      {
        id: "session" as const,
        icon: Timer,
        label: t("admin.security.sessionPolicyRow"),
        enabled: filterSettingsByPrefix(entries, sessionPolicyPrefix).some((entry) => entry.isSet),
        prefixes: [sessionPolicyPrefix],
      },
      {
        id: "hibp" as const,
        icon: ShieldAlert,
        label: t("admin.security.hibpTitle"),
        enabled: hibpEnabled,
        prefixes: [hibpPrefix],
      },
    ],
    [entries, hibpEnabled, t],
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
        <CardHeader title={t("admin.security.sessionTitle")} />
        <div className="space-y-2 px-4 py-4">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
              onClick={() => setOpenRow(row.id)}
            >
              <row.icon size={14} className={row.enabled ? "text-ok" : "text-muted-foreground"} />
              <span className="flex-1">
                <span className="block text-[12px] text-foreground/90">{row.label}</span>
                {row.id === "session" ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {t("admin.security.sessionRememberNote")}
                  </span>
                ) : null}
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
        title={activeRow?.label ?? t("admin.security.sessionTitle")}
        description={
          activeRow?.id === "hibp" ? t("admin.security.hibpBody") : t("admin.security.sessionBody")
        }
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

/** Everything the settings page renders for the security block. */
export function AdminSecuritySettingsCards({
  entries,
  canWrite,
  pendingKey,
  onSave,
  isSuperAdmin,
}: {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: SettingsSaver;
  readonly isSuperAdmin: boolean;
}) {
  return (
    <>
      {isSuperAdmin ? <AdminLoginRateLimitsCard /> : null}
      <AdminSecurityPolicyCards
        entries={entries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onSave={onSave}
      />
      {isSuperAdmin ? <AdminBulkPasswordResetCard /> : null}
    </>
  );
}
