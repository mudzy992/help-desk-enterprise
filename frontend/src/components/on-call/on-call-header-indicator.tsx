import { useCallback, useEffect, useRef, useState } from "react";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { formatOnCallClock } from "@/lib/on-call/on-call-view";
import { permissionKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { getOnCallMe, type OnCallMe } from "@/services/on-call-api";

/** Refreshing every 5 minutes is enough for a shift that changes at handoff. */
const refreshEveryMs = 5 * 60_000;

/** Current shift indicator for users allowed to read on-call data. */
export function OnCallHeaderIndicator() {
  const { t, i18n } = useTranslation();
  const { hasPermission, session } = useSessionCapabilities();
  const allowed =
    session !== null && (session.isSuperAdmin || hasPermission(permissionKeys.onCallRead));
  const [me, setMe] = useState<OnCallMe | null>(null);

  const mounted = useRef(true);
  const poll = useCallback(async () => {
    const loaded = await getOnCallMe();
    if (mounted.current) setMe(loaded);
  }, []);
  useVisibilityAwarePolling({
    poll,
    intervalMs: refreshEveryMs,
    enabled: allowed,
    telemetryKey: "on_call.header_poll_failed",
  });
  useEffect(() => {
    mounted.current = true;
    if (!allowed) setMe(null);
    return () => {
      mounted.current = false;
    };
  }, [allowed]);

  const shift = me?.enabled ? me.current[0] : undefined;
  if (shift === undefined) return null;
  const until = formatOnCallClock(shift.endsAt, i18n.language, shift.timezone);
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
