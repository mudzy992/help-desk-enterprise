import { MessageSquareLock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTicketTime } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketMessageResponse } from "@/services/tickets-collaboration-api";

interface TicketMessageBubbleProperties {
  readonly message: TicketMessageResponse;
  readonly authorName: string;
  readonly isOwn: boolean;
  readonly locale: string;
}

export function TicketMessageBubble({
  message,
  authorName,
  isOwn,
  locale,
}: TicketMessageBubbleProperties) {
  const { t } = useTranslation();
  const isInternal = message.type === "INTERNAL_NOTE";
  return (
    <div className={cn("flex gap-3", isOwn && "flex-row-reverse")}>
      <Avatar name={authorName} size="md" />
      <div className={cn("min-w-0 max-w-[78%]", isOwn && "flex flex-col items-end")}>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">{authorName}</span>
          <span className="text-[10.5px] text-muted-foreground/70">
            {formatRelativeTicketTime(message.createdAt, locale)}
          </span>
          {isInternal ? (
            <Badge tone="warning" className="px-1">
              <MessageSquareLock size={9} aria-hidden="true" />
              {t("tickets.detail.internalBadge")}
            </Badge>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-1 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed",
            isInternal
              ? "border-warning/25 bg-warning/6 text-foreground/90"
              : isOwn
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-border bg-surface text-foreground/95",
          )}
        >
          <p className="whitespace-pre-wrap">{message.body}</p>
        </div>
      </div>
    </div>
  );
}
