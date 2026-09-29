import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { formatOnCallClock } from "@/lib/on-call/on-call-view";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { getOnCallMe, type OnCallMe } from "@/services/on-call-api";

/** Refreshing every 5 minutes is enough for a shift that changes at handoff. */
const refreshEveryMs = 5 * 60_000;

/**
 * Paket 2.9 (K3, §4.4): "On call until 08:00" for whoever is on call right
 * now. Only asked for holders of oncall.read; silent when the feature is off.
 */
export function OnCallHeaderIndicator() {
  const { t, i18n } = useTranslation();
  const { hasPermission, session } = useSessionCapabilities();
  const allowed = session !== null && (session.isSuperAdmin || hasPermission(permissionKeys.onCallRead));
  const [me, setMe] = useState<OnCallMe | null>(null);

  useEffect(() => {
    if (!allowed) {
      setMe(null);
      return;
    }
    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      getOnCallMe()
        .then((loaded) => {
          if (active) setMe(loaded);
        })
        .catch(() => {
          if (active) setMe(null);
        });
    };
    load();
    const timer = window.setInterval(load, refreshEveryMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [allowed]);

  const shift = me?.enabled ? me.current[0] : undefined;
  if (shift === undefined) return null;
  const until = formatOnCallClock(shift.endsAt, i18n.language);
  const label = t("onCall.header.label", { group: shift.groupName, time: until });
  return (
    <Link
      to="/on-call"
      className="hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[12px] font-medium text-ok hover:underline sm:flex"
      aria-label={label}
      title={label}
      data-testid="on-call-indicator"
    >
      <CalendarClock size={13} strokeWidth={2} aria-hidden="true" />
      <span>{t("onCall.header.short", { time: until })}</span>
    </Link>
  );
}
