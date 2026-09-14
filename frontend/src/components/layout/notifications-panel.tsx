import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { NotificationsList } from "@/components/layout/notifications-list";
import { useLocale } from "@/i18n/use-locale";
import { cn } from "@/lib/utils";
import type { InAppNotification } from "@/services/notifications-api";

interface NotificationsPanelProperties {
  readonly items: readonly InAppNotification[];
  readonly unreadCount: number;
  readonly onClose: () => void;
  readonly onSelect: (notification: InAppNotification) => void;
  readonly onMarkAllRead: () => void;
}

export function NotificationsPanel({
  items,
  unreadCount,
  onClose,
  onSelect,
  onMarkAllRead,
}: NotificationsPanelProperties) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const visible = useMemo(
    () => (filter === "unread" ? items.filter((item) => !item.isRead) : items),
    [filter, items],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-foreground">
            {t("notifications.title")}
          </p>
          {unreadCount > 0 ? (
            <Badge tone="primary">{t("notifications.unreadCount", { count: unreadCount })}</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <button
            type="button"
            onClick={() => setFilter(filter === "all" ? "unread" : "all")}
            className={cn(
              "rounded-md px-2 py-1 transition-colors",
              filter === "unread"
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {filter === "unread" ? t("notifications.filterUnread") : t("notifications.filterAll")}
          </button>
          <button
            type="button"
            onClick={() => void onMarkAllRead()}
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("notifications.markAllRead")}
          </button>
        </div>
      </div>
      <NotificationsList
        items={visible}
        emptyLabel={
          filter === "unread"
            ? t("notifications.emptyUnread")
            : t("notifications.empty")
        }
        locale={locale}
        onSelect={(notification) => {
          onSelect(notification);
          onClose();
        }}
      />
    </div>
  );
}
