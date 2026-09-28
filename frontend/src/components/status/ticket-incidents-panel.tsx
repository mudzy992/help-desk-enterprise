import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Link2, Plus, Unlink } from "lucide-react";
import { Link } from "react-router-dom";
import { IncidentFormDialog } from "@/components/status/incident-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { availabilityTone, incidentStatusTone, localizedIncidentTitle, mapStatusError } from "@/lib/status/status-view";
import {
  getStatusOverview,
  linkTicketToIncident,
  listTicketIncidents,
  unlinkTicketFromIncident,
  type Incident,
} from "@/services/status-api";

interface TicketIncidentsPanelProperties {
  readonly ticketId: string;
  readonly serviceId: string;
  /** Changes whenever the ticket changes. */
  readonly versionKey: string;
}

/**
 * Paket 2.7 (§8.3). Staff: the incidents this ticket is linked to, link /
 * unlink, and "New incident" from this ticket (manage permission).
 * Requester: a "known problem" banner for public incidents only.
 */
export function TicketIncidentsPanel({ ticketId, serviceId, versionKey }: TicketIncidentsPanelProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { session, hasPermission, hasRole } = useSessionCapabilities();
  const canManage = session?.isSuperAdmin === true || hasRole(roleKeys.superAdmin) || hasPermission(permissionKeys.statusIncidentsManage);
  const [state, setState] = useState<{ readonly staff: boolean; readonly incidents: readonly Incident[] } | null>(null);
  const [candidates, setCandidates] = useState<readonly Incident[] | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await listTicketIncidents(ticketId));
    } catch {
      // Informational panel: a failure must not break the ticket screen.
      setState(null);
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load, versionKey]);

  const openPicker = async () => {
    try {
      const overview = await getStatusOverview();
      const linked = new Set(state?.incidents.map((incident) => incident.id) ?? []);
      const open = overview.activeIncidents.filter((incident) => !linked.has(incident.id));
      // Incidents on the ticket's own service first - the likely match.
      setCandidates([...open].sort((left, right) => Number(right.services.some((s) => s.id === serviceId)) - Number(left.services.some((s) => s.id === serviceId))));
      setChoice(open[0]?.id ?? "");
    } catch (caught) {
      toast({ tone: "danger", title: t(mapStatusError(caught) ?? mapApiError(caught)) });
    }
  };

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await work();
      toast({ tone: "success", title: success });
      setCandidates(null);
      await load();
    } catch (caught) {
      toast({ tone: "danger", title: t(mapStatusError(caught) ?? mapApiError(caught)) });
    } finally {
      setBusy(false);
    }
  };

  if (state === null) return null;

  if (!state.staff) {
    const open = state.incidents.filter((incident) => incident.status !== "RESOLVED");
    if (open.length === 0) return null;
    return (
      <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-3 text-[12.5px]" data-testid="ticket-known-problem">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <AlertTriangle size={14} className="text-warning" aria-hidden="true" />
          {t("status.banner.title")}
        </p>
        {open.map((incident) => (
          <p key={incident.id} className="mt-1 text-foreground/85">
            {localizedIncidentTitle(incident, i18n.language)} · {t(`status.status.${incident.status}`)}
          </p>
        ))}
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {t("status.ticketPanel.requesterHint")}{" "}
          <Link to="/status" className="text-link underline-offset-4 hover:underline">
            {t("status.banner.open")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <Card className="fade-in" data-testid="ticket-incidents">
      <CardHeader
        title={t("status.ticketPanel.title")}
        subtitle={state.incidents.length === 0 ? t("status.ticketPanel.none") : undefined}
        actions={
          canManage ? (
            <Button size="xs" variant="ghost" onClick={() => setCreateOpen(true)} disabled={busy}>
              <Plus />
              {t("status.ticketPanel.create")}
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-2.5 px-4 py-3">
        {state.incidents.map((incident) => (
          <div key={incident.id} className="flex items-start justify-between gap-2 text-[12.5px]">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{localizedIncidentTitle(incident, i18n.language)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge tone={availabilityTone(incident.impact)}>{t(`status.impact.${incident.impact}`)}</Badge>
                <Badge tone={incidentStatusTone(incident.status)}>{t(`status.status.${incident.status}`)}</Badge>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              disabled={busy}
              aria-label={t("status.ticketPanel.unlink")}
              title={t("status.ticketPanel.unlink")}
              onClick={() => void run(() => unlinkTicketFromIncident(incident.id, ticketId), t("status.ticketPanel.unlinked"))}
            >
              <Unlink />
            </Button>
          </div>
        ))}
        {candidates === null ? (
          <Button size="xs" variant="outline" className="justify-self-start" onClick={() => void openPicker()} disabled={busy}>
            <Link2 />
            {t("status.ticketPanel.link")}
          </Button>
        ) : candidates.length === 0 ? (
          <p className={hintClassName}>
            {t("status.ticketPanel.noOpen")}{" "}
            <Button size="xs" variant="link" onClick={() => setCandidates(null)}>
              {t("status.cancel")}
            </Button>
          </p>
        ) : (
          <div className="grid gap-2">
            <Select value={choice} onChange={(event) => setChoice(event.target.value)} aria-label={t("status.ticketPanel.pick")}>
              {candidates.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {localizedIncidentTitle(incident, i18n.language)} ({t(`status.impact.${incident.impact}`)})
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button
                size="xs"
                disabled={busy || choice.length === 0}
                onClick={() => void run(() => linkTicketToIncident(choice, ticketId), t("status.ticketPanel.linked"))}
              >
                {t("status.ticketPanel.linkSubmit")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setCandidates(null)} disabled={busy}>
                {t("status.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
      {createOpen ? (
        <IncidentFormDialog
          open
          onOpenChange={(open) => (open ? undefined : setCreateOpen(false))}
          mode={{ kind: "create", ticketIds: [ticketId], presetServiceIds: [serviceId] }}
          onSaved={() => void load()}
        />
      ) : null}
    </Card>
  );
}
