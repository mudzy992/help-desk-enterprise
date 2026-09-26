import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { NotificationsList } from "@/components/layout/notifications-list";
import { Segmented } from "@/components/ui/segmented";
import { useLocale } from "@/i18n/use-locale";
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {t("notifications.title")}
          </p>
          {unreadCount > 0 ? (
            <Badge tone="primary">{t("notifications.unreadCount", { count: unreadCount })}</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            ariaLabel={t("notifications.title")}
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: t("notifications.filterAll") },
              { value: "unread", label: t("notifications.filterUnread") },
            ]}
          />
          <button
            type="button"
            onClick={() => void onMarkAllRead()}
            className="rounded-md px-2 py-1 text-[11.5px] text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            {t("notifications.markAllRead")}
          </button>
          <Link
            to="/account/notifications"
            onClick={onClose}
            aria-label={t("account.notifications.menu")}
            title={t("account.notifications.menu")}
            className="rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            <Settings2 size={14} aria-hidden="true" />
          </Link>
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
