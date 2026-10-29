import { MessageSquare, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { describeTeamsError, type TeamsErrorDetails } from "@/lib/teams/map-teams-error";
import { useTeamsAsyncAction } from "@/lib/teams/use-teams-async-action";
import {
  listTeamsChannels,
  removeTeamsChannel,
  updateTeamsChannel,
  type TeamsChannelEvent,
  type TeamsChannelLink,
  type TeamsChannels,
} from "@/services/teams-api";

const modeKeys = { simulator: "teamsAdmin.mode.simulator", live: "teamsAdmin.mode.live" } as const;
const eventKeys: Record<
  TeamsChannelEvent,
  | "teamsAdmin.channels.event.created"
  | "teamsAdmin.channels.event.assigned"
  | "teamsAdmin.channels.event.slaWarning"
  | "teamsAdmin.channels.event.slaBreached"
> = {
  "ticket.created_in_group": "teamsAdmin.channels.event.created",
  "ticket.assigned_in_group": "teamsAdmin.channels.event.assigned",
  "sla.warning": "teamsAdmin.channels.event.slaWarning",
  "sla.breached": "teamsAdmin.channels.event.slaBreached",
};

export function TeamsChannelsTab() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<TeamsChannels | null>(null);
  const [loadError, setLoadError] = useState<TeamsErrorDetails | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TeamsChannelLink | null>(null);
  const { busy, error: actionError, run: runAction } = useTeamsAsyncAction();
  const errorKey = actionError ?? loadError;

  useEffect(() => {
    void listTeamsChannels()
      .then(setChannels)
      .catch((error: unknown) => setLoadError(describeTeamsError(error)));
  }, []);

  const run = async (operation: () => Promise<TeamsChannels>) => {
    const next = await runAction(operation);
    if (next !== undefined) setChannels(next);
  };

  if (channels === null)
    return errorKey ? (
      <ApiErrorText messageKey={errorKey.key} requestId={errorKey.requestId} />
    ) : (
      <PanelSkeleton label={t("session.loading")} />
    );
  if (channels.items.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare size={18} strokeWidth={1.8} />}
        title={t("teamsAdmin.channels.emptyTitle")}
        body={t("teamsAdmin.channels.emptyBody")}
      />
    );
  }
  return (
    <Card className="fade-in">
      <CardHeader
        title={t("teamsAdmin.channels.title")}
        subtitle={t("teamsAdmin.channels.subtitle")}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">
                {t("teamsAdmin.channels.group")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("teamsAdmin.channels.channel")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("teamsAdmin.channels.events")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("teamsAdmin.channels.includeTitle")}
              </th>
              <th scope="col" className="px-4 py-2">
                <span className="sr-only">{t("teamsAdmin.channels.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {channels.items.map((link) => (
              <tr key={link.id} className="border-b border-border align-top last:border-b-0">
                <td className="px-4 py-2 text-foreground">{link.groupName}</td>
                <td className="px-4 py-2">
                  <span className="text-foreground">
                    {link.teamName ?? "—"} / {link.channelName ?? "—"}
                  </span>
                  <span className="mt-0.5 flex gap-1">
                    <Badge tone={link.mode === "live" ? "success" : "info"}>
                      {t(modeKeys[link.mode])}
                    </Badge>
                    {link.removed ? (
                      <Badge tone="warning">{t("teamsAdmin.channels.removed")}</Badge>
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="grid gap-1">
                    {channels.events.map((event) => (
                      <Checkbox
                        key={event}
                        label={t(eventKeys[event])}
                        checked={link.events.includes(event)}
                        disabled={busy}
                        onChange={(changeEvent) => {
                          const next = changeEvent.target.checked
                            ? [...link.events, event]
                            : link.events.filter((item) => item !== event);
                          void run(() => updateTeamsChannel(link.id, { events: next }));
                        }}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <Checkbox
                    label={t("teamsAdmin.channels.includeTitleShort")}
                    checked={link.includeTitle}
                    disabled={busy}
                    onChange={(changeEvent) =>
                      void run(() =>
                        updateTeamsChannel(link.id, { includeTitle: changeEvent.target.checked }),
                      )
                    }
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setPendingRemove(link)}
                    aria-label={t("teamsAdmin.channels.remove")}
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errorKey ? (
        <div className="px-4 pb-3">
          <ApiErrorText messageKey={errorKey.key} requestId={errorKey.requestId} />
        </div>
      ) : null}
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
        title={t("teamsAdmin.channels.removeTitle")}
        description={t("teamsAdmin.channels.removeBody", { group: pendingRemove?.groupName ?? "" })}
        confirmLabel={t("teamsAdmin.channels.remove")}
        intent="danger"
        isPending={busy}
        onConfirm={() => {
          const link = pendingRemove;
          setPendingRemove(null);
          if (link) void run(() => removeTeamsChannel(link.id));
        }}
      />
    </Card>
  );
}
