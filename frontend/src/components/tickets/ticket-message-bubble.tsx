import { Mail, MessageSquareLock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/utils";
import { splitMentionSegments } from "@/lib/tickets/mention-tokens";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

interface TicketMessageBubbleProperties {
  readonly message: TicketMessageResponse;
  readonly authorName: string;
  readonly isOwn: boolean;
  readonly locale: string;
  /** Paket 2.4: highlights mentions of the current user. */
  readonly currentUserId?: string | null;
}

export function TicketMessageBubble({
  message,
  authorName,
  isOwn,
  locale,
  currentUserId = null,
}: TicketMessageBubbleProperties) {
  const { t } = useTranslation();
  const isInternal = message.type === "INTERNAL_NOTE";
  return (
    <div id={`message-${message.id}`} className={cn("fade-in flex scroll-mt-24 gap-3", isOwn && "flex-row-reverse")}>
      <Avatar name={authorName} size="md" />
      <div className={cn("min-w-0 max-w-[78%]", isOwn && "flex flex-col items-end")}>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">{authorName}</span>
          <span className="text-[10.5px] text-muted-foreground/70">
            <RelativeTime value={message.createdAt} locale={locale} />
          </span>
          {isInternal ? (
            <Badge tone="warning" className="px-1">
              <MessageSquareLock size={9} aria-hidden="true" />
              {t("tickets.detail.internalBadge")}
            </Badge>
          ) : null}
          {message.source === "EMAIL" ? (
            <Badge tone="info" className="px-1">
              <Mail size={9} aria-hidden="true" />
              {t("tickets.activity.viaEmail")}
            </Badge>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-1 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed shadow-card",
            isInternal
              ? "border-warning/25 bg-warning/6 text-foreground/90"
              : isOwn
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-border bg-surface text-foreground/95",
          )}
        >
          <p className="whitespace-pre-wrap">
            {isInternal
              ? splitMentionSegments(message.body).map((segment, index) =>
                  segment.kind === "text" ? (
                    <span key={index}>{segment.text}</span>
                  ) : (
                    <span
                      key={index}
                      data-testid="mention-chip"
                      className={cn(
                        "rounded px-1 font-medium",
                        segment.userId === currentUserId
                          ? "bg-primary/20 text-primary"
                          : "bg-primary/10 text-link",
                      )}
                    >
                      @{segment.name}
                    </span>
                  ),
                )
              : message.body}
          </p>
        </div>
      </div>
    </div>
  );
}
