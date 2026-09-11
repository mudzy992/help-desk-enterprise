import { GitBranch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TicketMessageBubble } from "@/components/tickets/ticket-message-bubble";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

interface TicketConversationProperties {
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly systemOnly?: boolean;
}

export function TicketConversation({
  messages,
  currentUserId,
  authorNames,
  systemOnly = false,
}: TicketConversationProperties) {
  const { t, i18n } = useTranslation();
  const visible = systemOnly
    ? messages.filter(
        (message) =>
          message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION",
      )
    : messages;
  if (visible.length === 0) {
    if (!systemOnly) {
      return null;
    }
    return (
      <EmptyState
        title={t("tickets.detail.noMessages")}
        body={t("tickets.detail.noMessagesHint")}
      />
    );
  }
  return (
    <div className="space-y-3">
      {visible.map((message) => {
        const isSystem =
          message.type === "SYSTEM_EVENT" || message.type === "APPROVAL_DECISION";
        if (isSystem) {
          return (
            <div key={message.id} className="flex items-start gap-2.5 px-1 py-0.5">
              <GitBranch
                size={13}
                className="mt-0.5 shrink-0 text-muted-foreground/60"
                aria-hidden="true"
              />
              <div>
                <p className="text-[12px] italic leading-5 text-muted-foreground">
                  {message.body}
                </p>
                <p className="text-[10.5px] text-muted-foreground/60 tnum">
                  {formatTicketTimestamp(message.createdAt, i18n.language)}
                </p>
              </div>
            </div>
          );
        }
        if (systemOnly) {
          return null;
        }
        const authorName =
          (message.authorUserId === null
            ? null
            : authorNames.get(message.authorUserId)) ??
          t("tickets.detail.systemEvent");
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
    </div>
  );
}
