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
import { announce } from "@/lib/a11y/announcer";
import { localizePersonName } from "@/lib/privacy/privacy-view";
import { cn } from "@/lib/utils";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

type ConversationViewport = "flow" | "fixed";

/** Focus target for "leave editor" (Esc) — 2.8 §4.1. */
export const TICKET_CONVERSATION_ID = "ticket-conversation";

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

  const seenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  /*
    2.8 §3.5: the log itself is aria-live="off" (a long body would be read in
    full); a new message from someone else is announced briefly instead. The
    first render only records what is already there.
  */
  useEffect(() => {
    if (systemOnly) {
      return;
    }
    const seen = seenIdsRef.current;
    if (seen === null) {
      seenIdsRef.current = new Set(messages.map((message) => message.id));
      return;
    }
    for (const message of messages) {
      if (seen.has(message.id)) {
        continue;
      }
      seen.add(message.id);
      const isSystem = message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION";
      const isOwn = currentUserId !== null && message.authorUserId === currentUserId;
      if (isSystem || isOwn) {
        continue;
      }
      const name = localizePersonName(
        resolveActivityActor(message.authorUserId, authorNames, t),
        i18n.language,
      );
      announce(
        t(
          message.type === "INTERNAL_NOTE"
            ? "a11y.conversation.newInternalNote"
            : "a11y.conversation.newMessage",
          { name },
        ),
        { dedupeKey: `message:${message.id}` },
      );
    }
  }, [messages, currentUserId, authorNames, systemOnly, t, i18n.language]);
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
      className={cn(
        "fade-in rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        VIEWPORT_CLASS[viewport],
      )}
      id={TICKET_CONVERSATION_ID}
      // A scrollable thread must be reachable by keyboard (arrow keys scroll it).
      tabIndex={viewport === "fixed" ? 0 : -1}
      role="log"
      aria-live="off"
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
                    : "mt-0.5 shrink-0 text-muted-foreground"
                }
                aria-hidden="true"
              />
              <div>
                <p className="text-[12px] italic leading-5 text-muted-foreground">
                  {activity.actor} · {activity.text}
                  {activity.note === null ? "" : ` — ${activity.note}`}
                </p>
                <p
                  className="text-[10.5px] text-muted-foreground tnum"
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
            currentUserId={currentUserId}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
