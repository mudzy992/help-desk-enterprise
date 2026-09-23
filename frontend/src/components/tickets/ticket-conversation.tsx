import { CheckCheck, GitBranch } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TicketMessageBubble } from "@/components/tickets/ticket-message-bubble";
import { EmptyState } from "@/components/ui/empty-state";
import {
  describeMessageActivity,
  resolveActivityActor,
} from "@/lib/tickets/describe-ticket-activity";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

type ConversationViewport = "flow" | "fixed";

/*
  `fixed` gives the thread its own scroll area with a stable height, so the
  composer and the side panels never move when a long ticket gets another
  reply — the page keeps its shape and only the thread scrolls.
*/
const VIEWPORT_CLASS: Record<ConversationViewport, string> = {
  flow: "space-y-3",
  fixed: "h-[320px] space-y-3 overflow-y-auto pr-1 sm:h-[420px]",
};

interface TicketConversationProperties {
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly systemOnly?: boolean;
  readonly viewport?: ConversationViewport;
}

export function TicketConversation({
  messages,
  currentUserId,
  authorNames,
  systemOnly = false,
  viewport = "flow",
}: TicketConversationProperties) {
  const { t, i18n } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  const visible = systemOnly
    ? messages.filter(
        (message) =>
          message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION",
      )
    : messages;
  if (visible.length === 0) {
    if (!systemOnly && viewport === "flow") {
      return null;
    }
    return (
      <div
        className={
          viewport === "fixed"
            ? "fade-in flex h-[320px] items-center justify-center sm:h-[420px]"
            : undefined
        }
      >
        <EmptyState
          title={t("tickets.detail.noMessages")}
          body={t("tickets.detail.noMessagesHint")}
        />
      </div>
    );
  }
  return (
    <div
      className={cn("fade-in", VIEWPORT_CLASS[viewport])}
      role="log"
      aria-label={t("tickets.detail.conversation")}
    >
      {visible.map((message) => {
        const isSystem =
          message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION";
        if (isSystem) {
          const isApproval = message.type === "APPROVAL_DECISION";
          const activity = describeMessageActivity(message, authorNames, t);
          const SystemIcon = isApproval ? CheckCheck : GitBranch;
          return (
            <div key={message.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-hover">
              <SystemIcon
                size={13}
                className={
                  isApproval
                    ? "mt-0.5 shrink-0 text-ok"
                    : "mt-0.5 shrink-0 text-muted-foreground/60"
                }
                aria-hidden="true"
              />
              <div>
                <p className="text-[12px] italic leading-5 text-muted-foreground">
                  {activity.actor} · {activity.text}
                  {activity.note === null ? "" : ` — ${activity.note}`}
                </p>
                <p
                  className="text-[10.5px] text-muted-foreground/60 tnum"
                  title={formatTicketTimestamp(message.createdAt, i18n.language)}
                >
                  {formatTicketTimestamp(message.createdAt, i18n.language)}
                </p>
              </div>
            </div>
          );
        }
        if (systemOnly) {
          return null;
        }
        const authorName = resolveActivityActor(
          message.authorUserId,
          authorNames,
          t,
        );
        const isOwn =
          currentUserId !== null && message.authorUserId === currentUserId;
        return (
          <TicketMessageBubble
            key={message.id}
            message={message}
            authorName={authorName}
            isOwn={isOwn}
            locale={i18n.language}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
