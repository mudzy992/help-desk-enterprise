import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  getUserNotificationPreferences,
  resetUserNotificationPreferences,
  type NotificationPreferencesSummary,
} from "@/services/notification-preferences-api";

/**
 * Paket 2.2 (N10): administrators see a summary of a user's notification
 * preferences and may reset them (audited) — never edit them.
 */
export function UserNotificationPreferencesSection({ userId }: { readonly userId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [summary, setSummary] = useState<NotificationPreferencesSummary | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await getUserNotificationPreferences(userId));
    } catch {
      setSummary(null);
    }
  }, [userId]);

  useEffect(() => {
    setSummary(null);
    void load();
  }, [load]);

  if (summary === null) return null;
  const customized = summary.customizedCategories > 0 || summary.quietHours !== null || summary.digestTime !== null;

  return (
    <div className="space-y-2" data-testid="user-notification-preferences-section">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        <dt className="text-muted-foreground">{t("users.notifications.customized")}</dt>
        <dd>{t("users.notifications.customizedCount", { count: summary.customizedCategories })}</dd>
        <dt className="text-muted-foreground">{t("users.notifications.quietHours")}</dt>
        <dd>
          {summary.quietHours
            ? `${summary.quietHours.start}–${summary.quietHours.end}${summary.quietHours.weekends ? ` · ${t("users.notifications.weekends")}` : ""}`
            : t("users.notifications.off")}
        </dd>
        <dt className="text-muted-foreground">{t("users.notifications.digestTime")}</dt>
        <dd>{summary.digestTime ?? t("users.notifications.default")}</dd>
        <dt className="text-muted-foreground">{t("users.notifications.pending")}</dt>
        <dd>{summary.pendingItems}</dd>
      </dl>
      {customized ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm(true)}>
          {t("users.notifications.reset")}
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("users.notifications.reset")}
        description={t("users.notifications.resetHint")}
        confirmLabel={t("users.notifications.resetConfirm")}
        intent="danger"
        isPending={busy}
        onConfirm={() =>
          void (async () => {
            setBusy(true);
            try {
              await resetUserNotificationPreferences(userId);
              toast({ tone: "success", title: t("users.notifications.resetDone") });
              setConfirm(false);
              await load();
            } catch {
              toast({ tone: "danger", title: t("account.security.actionFailed") });
            } finally {
              setBusy(false);
            }
          })()
        }
      />
    </div>
  );
}
