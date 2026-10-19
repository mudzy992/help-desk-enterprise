import { RefreshCw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AdaptiveCardPreview,
  type AdaptiveCardAction,
} from "@/components/teams/adaptive-card-preview";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { RelativeTime } from "@/components/ui/relative-time";
import { describeTeamsError, type TeamsErrorDetails } from "@/lib/teams/map-teams-error";
import { useTeamsAsyncAction } from "@/lib/teams/use-teams-async-action";
import { useTeamsSimulator } from "@/lib/teams/use-teams-simulator";
import { listUsersSummary, type UserSummary } from "@/services/users-api";
import {
  sendTeamsSimulatorActivity,
  type TeamsSimulatorMessage,
  type TeamsSimulatorScope,
} from "@/services/teams-api";

function cardsOf(message: TeamsSimulatorMessage): readonly Record<string, unknown>[] {
  const attachments = message.payload.attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((attachment) => (attachment as { content?: unknown }).content)
    .filter(
      (content): content is Record<string, unknown> =>
        typeof content === "object" && content !== null,
    );
}

function inboundLabel(
  message: TeamsSimulatorMessage,
  labels: { readonly actionSent: string; readonly installed: string },
): string {
  const payload = message.payload as {
    type?: unknown;
    text?: unknown;
    value?: { action?: { verb?: unknown } };
  };
  if (payload.type === "message" && typeof payload.text === "string")
    return payload.text.replace(/<at>[^<]*<\/at>\s*/g, "");
  if (payload.type === "invoke")
    return `${labels.actionSent}: ${String(payload.value?.action?.verb ?? "")}`;
  return labels.installed;
}

export function TeamsSimulatorTab() {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<readonly UserSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [scope, setScope] = useState<TeamsSimulatorScope>("personal");
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState<TeamsErrorDetails | null>(null);
  const { busy, error: actionError, run: runAction } = useTeamsAsyncAction();
  const errorKey = actionError ?? loadError;
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const endReference = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void listUsersSummary()
      .then((list) => {
        const active = list.filter((user) => user.isActive);
        setUsers(active);
        setUserId((current) => current || active[0]?.id || "");
      })
      .catch((error: unknown) => setLoadError(describeTeamsError(error)));
  }, []);

  const { messages, refreshErrorKey, refresh } = useTeamsSimulator(userId, scope);
  const normalizedUserSearch = userSearch.trim().toLocaleLowerCase(i18n.language);
  const visibleUsers = normalizedUserSearch
    ? users.filter((user) =>
        `${user.displayName} ${user.email}`
          .toLocaleLowerCase(i18n.language)
          .includes(normalizedUserSearch),
      )
    : users;

  const lastCount = useRef(0);
  useEffect(() => {
    if (messages.length > lastCount.current)
      endReference.current?.scrollIntoView?.({ block: "nearest" });
    lastCount.current = messages.length;
  }, [messages.length]);

  const send = async (input: {
    kind: "install" | "message" | "action";
    text?: string;
    verb?: string;
    data?: Record<string, unknown>;
    replyToId?: string;
  }): Promise<boolean> => {
    if (!userId) return false;
    const result = await runAction(() => sendTeamsSimulatorActivity({ ...input, userId, scope }));
    if (result === undefined) return false;
    setLastStatus(result.status);
    await refresh();
    return true;
  };

  const onCardAction = (message: TeamsSimulatorMessage) => (action: AdaptiveCardAction) =>
    void send({
      kind: "action",
      verb: action.verb,
      data: action.data,
      replyToId: message.activityId,
    });

  return (
    <div className="fade-in space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="grid min-w-[220px] gap-1 text-[12px] font-medium text-foreground">
            {t("teamsAdmin.simulator.userSearch")}
            <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
          </label>
          <label className="grid min-w-[220px] gap-1 text-[12px] font-medium text-foreground">
            {t("teamsAdmin.simulator.user")}
            <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
              {visibleUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.email})
                </option>
              ))}
            </Select>
          </label>
          <Segmented<TeamsSimulatorScope>
            label={t("teamsAdmin.simulator.scope")}
            value={scope}
            onChange={setScope}
            items={[
              { value: "personal", label: t("teamsAdmin.simulator.personal") },
              { value: "channel", label: t("teamsAdmin.simulator.channel") },
            ]}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !userId}
            onClick={() => void send({ kind: "install" })}
          >
            {t("teamsAdmin.simulator.install")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void refresh()}
            aria-label={t("teamsAdmin.refresh")}
          >
            <RefreshCw />
          </Button>
        </div>
        <p className={`px-4 pb-3 ${hintClassName}`}>{t("teamsAdmin.simulator.hint")}</p>
      </Card>
      <Card>
        <CardHeader
          title={t("teamsAdmin.simulator.transcript")}
          subtitle={
            lastStatus === null
              ? undefined
              : t("teamsAdmin.simulator.lastStatus", { status: lastStatus })
          }
        />
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className={hintClassName}>{t("teamsAdmin.simulator.empty")}</p>
          ) : null}
          {messages.map((message) => {
            const inbound = message.direction === "INBOUND";
            const cards = cardsOf(message);
            const plain = typeof message.payload.text === "string" ? message.payload.text : null;
            return (
              <div key={message.id} className={inbound ? "flex justify-end" : "flex justify-start"}>
                <div className="max-w-[min(560px,100%)] space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {inbound ? t("teamsAdmin.simulator.you") : t("teamsAdmin.simulator.bot")} ·{" "}
                    <RelativeTime value={message.updatedAt} locale={i18n.language} />
                  </p>
                  {inbound ? (
                    <p className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-[12.5px] text-foreground">
                      {inboundLabel(message, {
                        actionSent: t("teamsAdmin.simulator.actionSent"),
                        installed: t("teamsAdmin.simulator.installed"),
                      })}
                    </p>
                  ) : (
                    <>
                      {plain ? (
                        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-foreground">
                          {plain}
                        </p>
                      ) : null}
                      {cards.map((card, index) => (
                        <AdaptiveCardPreview
                          key={`${message.updatedAt}-${index}`}
                          card={card}
                          disabled={busy}
                          onAction={onCardAction(message)}
                        />
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
            void send({ kind: "message", text: value }).then((sent) => {
              if (sent) setText("");
            });
          }}
        >
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("teamsAdmin.simulator.placeholder")}
            aria-label={t("teamsAdmin.simulator.placeholder")}
            maxLength={2000}
          />
          <Button
            type="submit"
            size="default"
            disabled={busy || !userId || text.trim().length === 0}
          >
            <Send /> {t("teamsAdmin.simulator.send")}
          </Button>
        </form>
        {errorKey ? (
          <div className="px-4 pb-3">
            <ApiErrorText messageKey={errorKey.key} requestId={errorKey.requestId} />
          </div>
        ) : refreshErrorKey ? (
          <div className="px-4 pb-3">
            <ApiErrorText messageKey={refreshErrorKey} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
