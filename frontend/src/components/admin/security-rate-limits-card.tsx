import { ChevronRight, Gauge, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IdentityConfirmDialog } from "@/components/auth/identity-confirm-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  controlClassName,
  hintClassName,
  labelClassName,
  sectionTitleClassName,
} from "@/components/ui/control";
import { ResponsiveSurface } from "@/components/ui/responsive-surface";
import { useToast } from "@/components/ui/toast";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { ApiError } from "@/services/api";
import {
  getSecurityRateLimits,
  identityStepUpPurpose,
  updateSecurityRateLimits,
  type SecurityRateLimitBounds,
  type SecurityRateLimitConfig,
  type SecurityRateLimitSnapshot,
} from "@/services/security-api";

/**
 * Paket 5.4.0-e (M2) / 5.4.0-e.2 (UI polish): the login rate limits, edited the
 * way every other administration surface in this product edits values — the
 * card **shows** the three groups with their current thresholds and a row opens
 * a dialog; nothing is editable inline in a card (the rule that Postavke i
 * dodaci follow everywhere).
 *
 * Inside the dialog the eight scalars are one batch: one reason, one journalled
 * settings write, and a proof of identity (a current code or a fresh passkey
 * step-up for this purpose) before the request goes out. Every field shows the
 * bound the server enforces, so a typo is caught before the request.
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

type RateLimitField = (typeof rateLimitFields)[number];

export const rateLimitLabelKeys = {
  accountWindowSeconds: "admin.security.rateLimitAccountWindowSeconds",
  accountDelayStartsAfterFailures: "admin.security.rateLimitAccountDelayStartsAfterFailures",
  accountDelayBaseMilliseconds: "admin.security.rateLimitAccountDelayBaseMilliseconds",
  accountDelayMaxMilliseconds: "admin.security.rateLimitAccountDelayMaxMilliseconds",
  ipMaxFailures: "admin.security.rateLimitIpMaxFailures",
  ipWindowSeconds: "admin.security.rateLimitIpWindowSeconds",
  otherMaxFailures: "admin.security.rateLimitOtherMaxFailures",
  otherWindowSeconds: "admin.security.rateLimitOtherWindowSeconds",
} as const;

export const rateLimitGroups = [
  {
    id: "account",
    fields: [
      "accountWindowSeconds",
      "accountDelayStartsAfterFailures",
      "accountDelayBaseMilliseconds",
      "accountDelayMaxMilliseconds",
    ],
  },
  { id: "ip", fields: ["ipMaxFailures", "ipWindowSeconds"] },
  { id: "other", fields: ["otherMaxFailures", "otherWindowSeconds"] },
] as const satisfies readonly { readonly id: string; readonly fields: readonly RateLimitField[] }[];

export type RateLimitGroupId = (typeof rateLimitGroups)[number]["id"];

const groupTitleKeys = {
  account: "admin.security.rateLimitGroupAccount",
  ip: "admin.security.rateLimitGroupIp",
  other: "admin.security.rateLimitGroupOther",
} as const satisfies Record<RateLimitGroupId, string>;

export const minimumReasonLength = 5;

/** The first field that is not a whole number inside the server's bound. */
export function findOutOfBoundsRateLimit(
  config: SecurityRateLimitConfig,
  bounds: SecurityRateLimitBounds,
): RateLimitField | null {
  return (
    rateLimitFields.find((field) => {
      const value = config[field];
      const bound = bounds[field];
      return !Number.isInteger(value) || value < bound.min || value > bound.max;
    }) ?? null
  );
}

export function isValidRateLimitsReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= minimumReasonLength && trimmed.length <= 500;
}

/** The one-line summary a row shows; the numbers are the live configuration. */
export function groupSummary(
  group: RateLimitGroupId,
  config: SecurityRateLimitConfig,
  t: (key: never, options?: Record<string, unknown>) => string,
): string {
  if (group === "account") {
    return t("admin.security.rateLimitSummaryAccount" as never, {
      failures: config.accountDelayStartsAfterFailures,
      base: config.accountDelayBaseMilliseconds,
      max: config.accountDelayMaxMilliseconds,
      window: config.accountWindowSeconds,
    });
  }
  if (group === "ip") {
    return t("admin.security.rateLimitSummaryIp" as never, {
      failures: config.ipMaxFailures,
      window: config.ipWindowSeconds,
    });
  }
  return t("admin.security.rateLimitSummaryOther" as never, {
    failures: config.otherMaxFailures,
    window: config.otherWindowSeconds,
  });
}

export function AdminSecurityRateLimitsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const snapshot = useQuery({
    queryKey: ["admin", "security", "rate-limits"],
    queryFn: getSecurityRateLimits,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<SecurityRateLimitConfig | null>(null);
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);

  const config: SecurityRateLimitSnapshot | undefined = snapshot.data;

  useEffect(() => {
    if (isEditing && snapshot.data) {
      setDraft(snapshot.data.config);
      setErrorKey(null);
    }
  }, [isEditing, snapshot.data]);

  const bounds = snapshot.data?.bounds;
  const isOutOfBounds =
    draft === null || bounds === undefined
      ? true
      : findOutOfBoundsRateLimit(draft, bounds) !== null;
  const canSubmit = draft !== null && !isOutOfBounds && isValidRateLimitsReason(reason);

  const save = useMutation({
    mutationFn: (code?: string) =>
      updateSecurityRateLimits({
        config: draft as SecurityRateLimitConfig,
        reason: reason.trim(),
        code,
      }),
    onSuccess: () => {
      setErrorKey(null);
      setReason("");
      setIsEditing(false);
      toast({ tone: "success", title: t("admin.security.rateLimitsSaved") });
      void queryClient.invalidateQueries({ queryKey: ["admin", "security", "rate-limits"] });
    },
  });

  const runSave = async (code?: string) => {
    try {
      await save.mutateAsync(code);
    } catch (error) {
      // A missing or wrong second factor stays inside the confirmation dialog;
      // everything else is about the values, so it is shown on the surface.
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
        actions={
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={snapshot.isFetching}
            onClick={() => void snapshot.refetch()}
          >
            <RefreshCw size={12} />
            {t("admin.security.rateLimitsRefresh")}
          </Button>
        }
      />
      <div className="space-y-2 px-4 py-4">
        {snapshot.isLoading ? (
          <p className={hintClassName}>{t("admin.security.rateLimitsLoading")}</p>
        ) : null}
        {snapshot.isError ? <ApiErrorText messageKey={mapApiError(snapshot.error)} /> : null}
        {errorKey ? <ApiErrorText messageKey={errorKey} /> : null}
        {config
          ? rateLimitGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                data-testid={`admin-rate-limit-group-${group.id}`}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-elevated/40 px-3 py-2 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                onClick={() => setIsEditing(true)}
              >
                <Gauge size={14} className="text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-foreground/90">
                    {t(groupTitleKeys[group.id])}
                  </span>
                  <span className="tnum mt-0.5 block text-[11px] text-muted-foreground">
                    {groupSummary(group.id, config.config, t as never)}
                  </span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
              </button>
            ))
          : null}
      </div>

      <ResponsiveSurface
        open={isEditing && draft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditing(false);
            setErrorKey(null);
          }
        }}
        testId="admin-rate-limits-dialog"
        title={t("admin.security.rateLimitsTitle")}
        description={
          <span className="font-mono text-[11px] text-muted-foreground">
            private.security.rateLimits.*
          </span>
        }
      >
        <p className={hintClassName}>{t("admin.security.rateLimitsDialogHelp")}</p>
        {draft !== null && bounds !== undefined ? (
          <>
            {rateLimitGroups.map((group) => (
              <section key={group.id} className="mt-3">
                <h3 className={sectionTitleClassName}>{t(groupTitleKeys[group.id])}</h3>
                <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {group.fields.map((field) => (
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
              </section>
            ))}
            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/70 pt-3">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <span className="text-[11.5px] text-muted-foreground">
                  {t("admin.security.rateLimitsReason")}
                </span>
                <input
                  className={controlClassName}
                  type="text"
                  maxLength={500}
                  value={reason}
                  placeholder={t("admin.security.rateLimitsReasonPlaceholder")}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={!canSubmit || save.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                {save.isPending
                  ? t("settings.registry.saving")
                  : t("admin.security.rateLimitsSave")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setErrorKey(null);
                }}
              >
                {t("ui.cancel")}
              </Button>
            </div>
            <p className={hintClassName}>
              {t("admin.security.rateLimitsReasonHint", { count: minimumReasonLength })}
            </p>
          </>
        ) : null}
      </ResponsiveSurface>

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
