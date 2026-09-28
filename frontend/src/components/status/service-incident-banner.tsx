import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Bell, BellOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { localizedIncidentTitle, mapStatusError } from "@/lib/status/status-view";
import {
  listServiceIncidents,
  subscribeToIncident,
  unsubscribeFromIncident,
  type Incident,
} from "@/services/status-api";

/**
 * Paket 2.7 (§8.3): "Known problem" while opening a ticket. Loaded only when
 * the catalog already says the service has an open incident, so choosing a
 * healthy service costs no extra request. The requester may still create
 * the ticket - the banner informs, it never blocks.
 */
export function ServiceIncidentBanner({ serviceId, hasIncident }: { readonly serviceId: string; readonly hasIncident: boolean }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<readonly Incident[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (serviceId.length === 0 || !hasIncident) {
      setIncidents([]);
      return;
    }
    let active = true;
    listServiceIncidents(serviceId)
      .then((response) => {
        if (active) setIncidents(response.incidents);
      })
      // Informational only: a failure must not disturb ticket creation.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [serviceId, hasIncident]);

  if (incidents.length === 0) return null;

  const toggle = async (incident: Incident) => {
    setBusyId(incident.id);
    try {
      if (incident.subscribed) await unsubscribeFromIncident(incident.id);
      else await subscribeToIncident(incident.id);
      setIncidents((current) =>
        current.map((item) => (item.id === incident.id ? { ...item, subscribed: !incident.subscribed } : item)),
      );
      toast({ tone: "success", title: incident.subscribed ? t("status.card.unsubscribed") : t("status.card.subscribed") });
    } catch (caught) {
      toast({ tone: "danger", title: t(mapStatusError(caught) ?? mapApiError(caught)) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-5 pb-1" data-testid="service-incident-banner">
      {incidents.map((incident) => (
        <div
          key={incident.id}
          role="status"
          className="mt-3 flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-[12.5px]">
            <p className="font-semibold text-foreground">
              {t("status.banner.title")}: {localizedIncidentTitle(incident, i18n.language)}
            </p>
            {incident.updates[0] ? (
              <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-foreground/85">{incident.updates[0].message}</p>
            ) : null}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {t("status.banner.hint")}{" "}
              <Link to="/status" className="text-link underline-offset-4 hover:underline">
                {t("status.banner.open")}
              </Link>
            </p>
          </div>
          <Button type="button" size="xs" variant={incident.subscribed ? "secondary" : "outline"} disabled={busyId === incident.id} onClick={() => void toggle(incident)}>
            {incident.subscribed ? <BellOff /> : <Bell />}
            {incident.subscribed ? t("status.card.unsubscribe") : t("status.card.subscribe")}
          </Button>
        </div>
      ))}
    </div>
  );
}
