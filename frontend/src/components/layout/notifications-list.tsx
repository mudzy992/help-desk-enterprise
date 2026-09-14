import { Settings2, Ticket, Timer, UserCog } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/utils";
import {
  notificationKind,
  notificationTitleKey,
  type NotificationKind,
} from "@/lib/notifications/notification-kind";
import type { InAppNotification } from "@/services/notifications-api";

const KIND_ICON: Record<NotificationKind, typeof Ticket> = {
  ticket: Ticket,
  sla: Timer,
  approval: UserCog,
  system: Settings2,
};

const KIND_TONE: Record<NotificationKind, string> = {
  ticket: "border-primary/30 bg-primary/10 text-[#7FA8F5]",
  sla: "border-danger/30 bg-danger/10 text-danger",
  approval: "border-warning/30 bg-warning/10 text-warning",
  system: "border-border bg-background text-muted-foreground",
};

interface NotificationsListProperties {
  readonly items: readonly InAppNotification[];
  readonly emptyLabel: string;
  readonly locale: string;
  readonly onSelect: (notification: InAppNotification) => void;
}

export function NotificationsList({
  items,
  emptyLabel,
  locale,
  onSelect,
}: NotificationsListProperties) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="max-h-[380px] overflow-y-auto">
      {items.map((notification) => {
        const kind = notificationKind(notification.type);
        const Icon = KIND_ICON[kind];
        const ticketNumber = notification.payload?.ticketNumber;
        return (
          <li key={notification.id}>
            <button
              type="button"
              className="flex w-full items-start gap-3 border-b border-border/40 px-3.5 py-3 text-left transition-colors hover:bg-background/50"
              onClick={() => onSelect(notification)}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                  KIND_TONE[kind],
                )}
              >
                <Icon size={13.5} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[12.5px]",
                      notification.isRead
                        ? "font-medium text-foreground/85"
                        : "font-semibold text-foreground",
                    )}
                  >
                    {t(notificationTitleKey(notification.type), {
                      ticketNumber: ticketNumber ?? "",
                    })}
                  </span>
                  <RelativeTime
                    value={notification.createdAt}
                    locale={locale}
                    className="shrink-0 text-[10.5px] text-muted-foreground/70"
                  />
                </span>
                {notification.body ? (
                  <span className="mt-0.5 block text-[11.5px] leading-4.5 text-muted-foreground">
                    {notification.body}
                  </span>
                ) : null}
              </span>
              {notification.isRead ? null : (
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
