import { GitBranch, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

interface TicketConversationProperties {
  readonly messages: readonly TicketMessageResponse[];
  readonly currentUserId: string | null;
}

export function TicketConversation({
  messages,
  currentUserId,
}: TicketConversationProperties) {
  const { t, i18n } = useTranslation();
  if (messages.length === 0) {
    return (
      <EmptyState
        title={t("tickets.detail.noMessages")}
        body={t("tickets.detail.noMessagesHint")}
      />
    );
  }
  return (
    <ol className="grid gap-3">
      {messages.map((message) => {
        const isSystem = message.type === "SYSTEM_EVENT";
        const isInternal = message.type === "INTERNAL_NOTE";
        const isOwn =
          currentUserId !== null &&
          message.authorUserId === currentUserId &&
          !isSystem &&
          !isInternal;
        if (isSystem) {
          return (
            <li key={message.id} className="flex items-start gap-2 px-1 py-1">
              <GitBranch
                size={13}
                strokeWidth={1.8}
                className="mt-0.5 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
              <div>
                <p className="text-[12px] italic leading-5 text-muted-foreground">
                  {message.body}
                </p>
                <time className="mt-0.5 block text-[11px] text-muted-foreground/80 tnum">
                  {formatTicketTimestamp(message.createdAt, i18n.language)}
                </time>
              </div>
            </li>
          );
        }
        return (
          <li
            key={message.id}
            className={cn(
              "rounded-lg border px-3 py-3",
              isInternal && "border-warning/30 bg-warning/10",
              isOwn && "border-primary/35 bg-primary/10",
              !isInternal && !isOwn && "border-border bg-background/40",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                {isInternal ? <Lock size={12} strokeWidth={1.8} aria-hidden="true" /> : null}
                {t(`tickets.messageType.${message.type}`)}
              </span>
              <time className="text-[11px] text-muted-foreground tnum">
                {formatTicketTimestamp(message.createdAt, i18n.language)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
              {message.body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
