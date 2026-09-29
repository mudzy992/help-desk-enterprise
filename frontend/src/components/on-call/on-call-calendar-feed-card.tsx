import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { mapOnCallError } from "@/lib/on-call/on-call-view";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import {
  getOnCallCalendarToken,
  getOnCallMe,
  onCallCalendarUrl,
  revokeOnCallCalendarToken,
  rotateOnCallCalendarToken,
} from "@/services/on-call-api";

/**
 * Paket 2.9 (K3, §4.6): personal iCal subscription. The URL is shown once
 * after it is created (only a hash is stored); a new one invalidates the old.
 */
export function OnCallCalendarFeedCard() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<{ readonly exists: boolean; readonly createdAt: string | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);

  useEffect(() => {
    let active = true;
    // Hidden while the on-call feature is switched off.
    Promise.all([getOnCallMe(), getOnCallCalendarToken()])
      .then(([me, token]) => {
        if (active) setStatus(me.enabled ? token : null);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === null) return null;

  const rotate = async () => {
    setBusy(true);
    try {
      const { token } = await rotateOnCallCalendarToken();
      setUrl(onCallCalendarUrl(token));
      setStatus({ exists: true, createdAt: new Date().toISOString() });
      setConfirm(null);
    } catch (caught) {
      toast({ tone: "danger", title: t(mapOnCallError(caught) ?? mapApiError(caught)) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await revokeOnCallCalendarToken();
      setUrl(null);
      setStatus({ exists: false, createdAt: null });
      setConfirm(null);
      toast({ tone: "success", title: t("onCall.feed.revoked") });
    } catch (caught) {
      toast({ tone: "danger", title: t(mapApiError(caught)) });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (url === null) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ tone: "success", title: t("onCall.feed.copied") });
    } catch {
      toast({ tone: "danger", title: t("onCall.feed.copyFailed") });
    }
  };

  return (
    <Card>
      <CardHeader
        title={t("onCall.feed.title")}
        subtitle={t("onCall.feed.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            {status.exists ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm("revoke")} disabled={busy}>
                {t("onCall.feed.revoke")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={status.exists ? "outline" : "primary"}
              onClick={() => (status.exists ? setConfirm("rotate") : void rotate())}
              disabled={busy}
            >
              <KeyRound />
              {status.exists ? t("onCall.feed.rotate") : t("onCall.feed.create")}
            </Button>
          </div>
        }
      />
      <div className="grid gap-2 p-4">
        {url !== null ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label={t("onCall.feed.url")} onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label={t("onCall.feed.copy")}>
                <Copy />
              </Button>
            </div>
            <p role="status" className="text-[12px] font-medium text-warning">
              {t("onCall.feed.onceWarning")}
            </p>
          </>
        ) : status.exists && status.createdAt ? (
          <p className={hintClassName}>{t("onCall.feed.active", { time: formatTicketTimestamp(status.createdAt, i18n.language) })}</p>
        ) : (
          <p className={hintClassName}>{t("onCall.feed.none")}</p>
        )}
        <p className={hintClassName}>{t("onCall.feed.hint")}</p>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        title={confirm === "revoke" ? t("onCall.feed.revokeTitle") : t("onCall.feed.rotateTitle")}
        description={confirm === "revoke" ? t("onCall.feed.revokeBody") : t("onCall.feed.rotateBody")}
        confirmLabel={confirm === "revoke" ? t("onCall.feed.revoke") : t("onCall.feed.rotate")}
        intent="danger"
        isPending={busy}
        onConfirm={() => void (confirm === "revoke" ? revoke() : rotate())}
      />
    </Card>
  );
}
