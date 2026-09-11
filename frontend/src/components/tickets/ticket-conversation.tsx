import { useTranslation } from "react-i18next";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

interface TicketConversationProperties {
  readonly messages: readonly TicketMessageResponse[];
}

export function TicketConversation({ messages }: TicketConversationProperties) {
  const { t, i18n } = useTranslation();
  if (messages.length === 0) {
    return <p className="text-body text-muted-foreground">{t("tickets.detail.noMessages")}</p>;
  }
  return (
    <ol className="grid gap-3">
      {messages.map((message) => {
        const isSystem = message.type === "SYSTEM_EVENT";
        const isInternal = message.type === "INTERNAL_NOTE";
        return (
          <li
            key={message.id}
            className={cn(
              "border border-border px-3 py-3",
              isInternal ? "bg-elevated/60" : "bg-surface",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-metadata text-muted-foreground">
                {t(`tickets.messageType.${message.type}`)}
              </span>
              <time className="text-metadata text-muted-foreground">
                {formatTicketTimestamp(message.createdAt, i18n.language)}
              </time>
            </div>
            <p
              className={cn(
                "mt-2 whitespace-pre-wrap text-body",
                isSystem ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {message.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
