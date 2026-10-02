import { CheckCircle2, Download, MessageSquare, RefreshCw, Send, Trash2, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AdaptiveCardPreview, type AdaptiveCardAction } from "@/components/teams/adaptive-card-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { RelativeTime } from "@/components/ui/relative-time";
import { Segmented } from "@/components/ui/segmented";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { UnderlineTabs } from "@/components/ui/tabs";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapTeamsError, type TeamsErrorKey } from "@/lib/teams/map-teams-error";
import { listUsersSummary, type UserSummary } from "@/services/users-api";
import {
  checkTeamsReadiness,
  downloadTeamsPackage,
  getTeamsStatus,
  listTeamsChannels,
  listTeamsSimulatorMessages,
  removeTeamsChannel,
  sendTeamsSimulatorActivity,
  updateTeamsChannel,
  type TeamsChannelLink,
  type TeamsChannels,
  type TeamsReadiness,
  type TeamsSimulatorMessage,
  type TeamsSimulatorScope,
  type TeamsStatus,
} from "@/services/teams-api";

type TeamsTab = "status" | "channels" | "simulator";

const modeKeys = {
  off: "teamsAdmin.mode.off",
  simulator: "teamsAdmin.mode.simulator",
  live: "teamsAdmin.mode.live",
} as const;

const readinessKeys = {
  addon: "teamsAdmin.readiness.checks.addon",
  tenant: "teamsAdmin.readiness.checks.tenant",
  appId: "teamsAdmin.readiness.checks.appId",
  credential: "teamsAdmin.readiness.checks.credential",
  token: "teamsAdmin.readiness.checks.token",
  publicUrl: "teamsAdmin.readiness.checks.publicUrl",
  endpoint: "teamsAdmin.readiness.checks.endpoint",
  simulatorSecret: "teamsAdmin.readiness.checks.simulatorSecret",
} as const;

const eventKeys: Record<string, "teamsAdmin.channels.event.created" | "teamsAdmin.channels.event.assigned" | "teamsAdmin.channels.event.slaWarning" | "teamsAdmin.channels.event.slaBreached"> = {
  "ticket.created_in_group": "teamsAdmin.channels.event.created",
  "ticket.assigned_in_group": "teamsAdmin.channels.event.assigned",
  "sla.warning": "teamsAdmin.channels.event.slaWarning",
  "sla.breached": "teamsAdmin.channels.event.slaBreached",
};
const simulatorPollMs = 4_000;

/** Paket 3.1 (§16): Administration → Microsoft Teams (`integrations.teams.manage`). */
export function TeamsAdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TeamsTab>("status");
  const [status, setStatus] = useState<TeamsStatus | null>(null);
  const [errorKey, setErrorKey] = useState<TeamsErrorKey | null>(null);

  const loadStatus = useCallback(() => {
    void getTeamsStatus()
      .then((next) => {
        setStatus(next);
        setErrorKey(null);
      })
      .catch((error: unknown) => setErrorKey(mapTeamsError(error)));
  }, []);

  useEffect(loadStatus, [loadStatus]);

  const tabs = [
    { key: "status", label: t("teamsAdmin.tabs.status") },
    { key: "channels", label: t("teamsAdmin.tabs.channels") },
    ...(status?.simulatorAvailable ? [{ key: "simulator", label: t("teamsAdmin.tabs.simulator") }] : []),
  ];

  return (
    <section>
      <PageHeader
        crumbs={[t("navigation.admin"), t("teamsAdmin.title")]}
        title={t("teamsAdmin.title")}
        subtitle={t("teamsAdmin.subtitle")}
      />
      <UnderlineTabs className="mb-4" active={tab} onChange={(key) => setTab(key as TeamsTab)} items={tabs} />
      {errorKey ? <p className={`mb-3 ${errorTextClassName}`}>{t(errorKey)}</p> : null}
      {status === null && errorKey === null ? <PanelSkeleton label={t("session.loading")} /> : null}
      {status !== null && tab === "status" ? <StatusTab status={status} onRefresh={loadStatus} /> : null}
      {status !== null && tab === "channels" ? <ChannelsTab /> : null}
      {status?.simulatorAvailable && tab === "simulator" ? <SimulatorTab /> : null}
    </section>
  );
}

function StatusTab({ status, onRefresh }: { readonly status: TeamsStatus; readonly onRefresh: () => void }) {
  const { t, i18n } = useTranslation();
  const [readiness, setReadiness] = useState<TeamsReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TeamsErrorKey | null>(null);
  const locale = i18n.language;

  const runReadiness = async () => {
    setBusy(true);
    setErrorKey(null);
    try {
      setReadiness(await checkTeamsReadiness());
      onRefresh();
    } catch (error) {
      setErrorKey(mapTeamsError(error));
    } finally {
      setBusy(false);
    }
  };

  const runPackage = async (packageLocale: "bs" | "en") => {
    setBusy(true);
    setErrorKey(null);
    try {
      const file = await downloadTeamsPackage(packageLocale);
      triggerBlobDownload(file.blob, file.fileName);
    } catch (error) {
      setErrorKey(mapTeamsError(error));
    } finally {
      setBusy(false);
    }
  };

  const fact = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[12.5px] last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
  const time = (value: string | null) => (value ? <RelativeTime value={value} locale={locale} /> : t("teamsAdmin.status.never"));

  return (
    <div className="fade-in grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={t("teamsAdmin.status.title")}
          actions={
            <Button size="xs" variant="ghost" onClick={onRefresh} aria-label={t("teamsAdmin.refresh")}>
              <RefreshCw />
            </Button>
          }
        />
        <div className="px-4 pb-4">
          {fact(
            t("teamsAdmin.status.mode"),
            <Badge tone={status.mode === "off" ? "neutral" : status.mode === "live" ? "success" : "info"} dot>
              {t(modeKeys[status.mode])}
            </Badge>,
          )}
          {fact(t("teamsAdmin.status.configuredMode"), t(modeKeys[status.configuredMode]))}
          {fact(t("teamsAdmin.status.personal"), status.personalConversations)}
          {fact(t("teamsAdmin.status.channels"), status.channelConversations)}
          {fact(t("teamsAdmin.status.linkedGroups"), status.linkedGroups)}
          {fact(t("teamsAdmin.status.lastInbound"), time(status.lastInboundAt))}
          {fact(t("teamsAdmin.status.lastDelivery"), time(status.lastDeliveryAt))}
          {fact(
            t("teamsAdmin.status.failed"),
            <Badge tone={status.failedDeliveries > 0 ? "danger" : "neutral"}>{status.failedDeliveries}</Badge>,
          )}
          {fact(t("teamsAdmin.status.endpoint"), <span className="break-all font-mono text-[11.5px]">{status.messagingEndpoint ?? "—"}</span>)}
          {!status.addonEnabled ? (
            <p className={`mt-3 ${hintClassName}`}>
              {t("teamsAdmin.status.addonOff")}{" "}
              <Link className="text-link underline-offset-4 hover:underline" to="/admin?tab=settings">
                {t("teamsAdmin.status.openSettings")}
              </Link>
            </p>
          ) : null}
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={t("teamsAdmin.readiness.title")}
            subtitle={t("teamsAdmin.readiness.subtitle")}
            actions={
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void runReadiness()}>
                {t("teamsAdmin.readiness.run")}
              </Button>
            }
          />
          <div className="px-4 pb-4">
            {readiness === null ? (
              <p className={hintClassName}>{t("teamsAdmin.readiness.notRun")}</p>
            ) : (
              <ul className="space-y-1.5" aria-label={t("teamsAdmin.readiness.title")}>
                {readiness.checks.map((check) => (
                  <li key={check.key} className="flex items-start gap-2 text-[12.5px]">
                    {check.ok ? (
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" aria-label={t("teamsAdmin.readiness.ok")} />
                    ) : (
                      <XCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-label={t("teamsAdmin.readiness.fail")} />
                    )}
                    <span>
                      <span className="text-foreground">{t(readinessKeys[check.key])}</span>
                      {check.detail ? <span className="block break-all text-[11.5px] text-muted-foreground">{check.detail}</span> : null}
                    </span>
                  </li>
                ))}
                <li className="pt-1">
                  <Badge tone={readiness.ready ? "success" : "warning"}>
                    {readiness.ready ? t("teamsAdmin.readiness.ready") : t("teamsAdmin.readiness.notReady")}
                  </Badge>
                </li>
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t("teamsAdmin.package.title")} subtitle={t("teamsAdmin.package.subtitle")} />
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void runPackage("bs")}>
              <Download /> {t("teamsAdmin.package.downloadBs")}
            </Button>
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void runPackage("en")}>
              <Download /> {t("teamsAdmin.package.downloadEn")}
            </Button>
          </div>
        </Card>
        {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      </div>
    </div>
  );
}

function ChannelsTab() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<TeamsChannels | null>(null);
  const [errorKey, setErrorKey] = useState<TeamsErrorKey | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TeamsChannelLink | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listTeamsChannels()
      .then(setChannels)
      .catch((error: unknown) => setErrorKey(mapTeamsError(error)));
  }, []);

  const run = async (operation: () => Promise<TeamsChannels>) => {
    setBusy(true);
    setErrorKey(null);
    try {
      setChannels(await operation());
    } catch (error) {
      setErrorKey(mapTeamsError(error));
    } finally {
      setBusy(false);
    }
  };

  if (channels === null) return errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : <PanelSkeleton label={t("session.loading")} />;
  if (channels.items.length === 0) {
    return <EmptyState icon={<MessageSquare size={18} strokeWidth={1.8} />} title={t("teamsAdmin.channels.emptyTitle")} body={t("teamsAdmin.channels.emptyBody")} />;
  }
  return (
    <Card className="fade-in">
      <CardHeader title={t("teamsAdmin.channels.title")} subtitle={t("teamsAdmin.channels.subtitle")} />
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[11.5px] text-muted-foreground">
              <th className="px-4 py-2 font-medium">{t("teamsAdmin.channels.group")}</th>
              <th className="px-4 py-2 font-medium">{t("teamsAdmin.channels.channel")}</th>
              <th className="px-4 py-2 font-medium">{t("teamsAdmin.channels.events")}</th>
              <th className="px-4 py-2 font-medium">{t("teamsAdmin.channels.includeTitle")}</th>
              <th className="px-4 py-2" aria-label={t("teamsAdmin.channels.actions")} />
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
                    <Badge tone={link.mode === "live" ? "success" : "info"}>{t(modeKeys[link.mode])}</Badge>
                    {link.removed ? <Badge tone="warning">{t("teamsAdmin.channels.removed")}</Badge> : null}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="grid gap-1">
                    {channels.events.filter((event) => event in eventKeys).map((event) => (
                      <Checkbox
                        key={event}
                        label={t(eventKeys[event]!)}
                        checked={link.events.includes(event)}
                        disabled={busy}
                        onChange={(changeEvent) => {
                          const next = changeEvent.target.checked ? [...link.events, event] : link.events.filter((item) => item !== event);
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
                    onChange={(changeEvent) => void run(() => updateTeamsChannel(link.id, { includeTitle: changeEvent.target.checked }))}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="xs" variant="ghost" disabled={busy} onClick={() => setPendingRemove(link)} aria-label={t("teamsAdmin.channels.remove")}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errorKey ? <p className={`px-4 pb-3 ${errorTextClassName}`}>{t(errorKey)}</p> : null}
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => (open ? null : setPendingRemove(null))}
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

function cardsOf(message: TeamsSimulatorMessage): readonly Record<string, unknown>[] {
  const attachments = message.payload.attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((attachment) => (attachment as { content?: unknown }).content)
    .filter((content): content is Record<string, unknown> => typeof content === "object" && content !== null);
}

function inboundLabel(message: TeamsSimulatorMessage, labels: { readonly actionSent: string; readonly installed: string }): string {
  const payload = message.payload as { type?: unknown; text?: unknown; value?: { action?: { verb?: unknown } } };
  if (payload.type === "message" && typeof payload.text === "string") return payload.text.replace(/<at>[^<]*<\/at>\s*/g, "");
  if (payload.type === "invoke") return `${labels.actionSent}: ${String(payload.value?.action?.verb ?? "")}`;
  return labels.installed;
}

function SimulatorTab() {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [scope, setScope] = useState<TeamsSimulatorScope>("personal");
  const [messages, setMessages] = useState<readonly TeamsSimulatorMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TeamsErrorKey | null>(null);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const endReference = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void listUsersSummary()
      .then((list) => {
        const active = list.filter((user) => user.isActive);
        setUsers(active);
        setUserId((current) => current || active[0]?.id || "");
      })
      .catch((error: unknown) => setErrorKey(mapTeamsError(error)));
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await listTeamsSimulatorMessages(userId, scope);
      setMessages(result.items);
    } catch (error) {
      setErrorKey(mapTeamsError(error));
    }
  }, [userId, scope]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), simulatorPollMs);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const lastCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastCount.current) endReference.current?.scrollIntoView?.({ block: "nearest" });
    lastCount.current = messages.length;
  }, [messages.length]);

  const send = async (input: { kind: "install" | "message" | "action"; text?: string; verb?: string; data?: Record<string, unknown>; replyToId?: string }) => {
    if (!userId) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const result = await sendTeamsSimulatorActivity({ ...input, userId, scope });
      setLastStatus(result.status);
      await refresh();
    } catch (error) {
      setErrorKey(mapTeamsError(error));
    } finally {
      setBusy(false);
    }
  };

  const onCardAction = (message: TeamsSimulatorMessage) => (action: AdaptiveCardAction) =>
    void send({ kind: "action", verb: action.verb, data: action.data, replyToId: message.activityId });

  return (
    <div className="fade-in space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="grid min-w-[220px] gap-1 text-[12px] font-medium text-foreground">
            {t("teamsAdmin.simulator.user")}
            <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.email})
                </option>
              ))}
            </Select>
          </label>
          <Segmented<TeamsSimulatorScope>
            ariaLabel={t("teamsAdmin.simulator.scope")}
            value={scope}
            onChange={setScope}
            items={[
              { value: "personal", label: t("teamsAdmin.simulator.personal") },
              { value: "channel", label: t("teamsAdmin.simulator.channel") },
            ]}
          />
          <Button size="sm" variant="outline" disabled={busy || !userId} onClick={() => void send({ kind: "install" })}>
            {t("teamsAdmin.simulator.install")}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()} aria-label={t("teamsAdmin.refresh")}>
            <RefreshCw />
          </Button>
        </div>
        <p className={`px-4 pb-3 ${hintClassName}`}>{t("teamsAdmin.simulator.hint")}</p>
      </Card>
      <Card>
        <CardHeader title={t("teamsAdmin.simulator.transcript")} subtitle={lastStatus === null ? undefined : t("teamsAdmin.simulator.lastStatus", { status: lastStatus })} />
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 pb-3" aria-live="polite">
          {messages.length === 0 ? <p className={hintClassName}>{t("teamsAdmin.simulator.empty")}</p> : null}
          {messages.map((message) => {
            const inbound = message.direction === "INBOUND";
            const cards = cardsOf(message);
            const plain = typeof message.payload.text === "string" ? message.payload.text : null;
            return (
              <div key={message.id} className={inbound ? "flex justify-end" : "flex justify-start"}>
                <div className="max-w-[min(560px,100%)] space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {inbound ? t("teamsAdmin.simulator.you") : t("teamsAdmin.simulator.bot")} · <RelativeTime value={message.updatedAt} locale={i18n.language} />
                  </p>
                  {inbound ? (
                    <p className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[12.5px] text-foreground">{inboundLabel(message, { actionSent: t("teamsAdmin.simulator.actionSent"), installed: t("teamsAdmin.simulator.installed") })}</p>
                  ) : (
                    <>
                      {plain ? <p className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-foreground">{plain}</p> : null}
                      {cards.map((card, index) => (
                        <AdaptiveCardPreview key={`${message.updatedAt}-${index}`} card={card} disabled={busy} onAction={onCardAction(message)} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endReference} />
        </div>
        <form
          className="flex gap-2 border-t border-border px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = text.trim();
            if (!value) return;
            setText("");
            void send({ kind: "message", text: value });
          }}
        >
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("teamsAdmin.simulator.placeholder")}
            aria-label={t("teamsAdmin.simulator.placeholder")}
            maxLength={2000}
          />
          <Button type="submit" size="default" disabled={busy || !userId || text.trim().length === 0}>
            <Send /> {t("teamsAdmin.simulator.send")}
          </Button>
        </form>
        {errorKey ? <p className={`px-4 pb-3 ${errorTextClassName}`}>{t(errorKey)}</p> : null}
      </Card>
    </div>
  );
}
