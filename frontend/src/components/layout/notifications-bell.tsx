import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { floatingPanelClassName } from "@/components/ui/control";
import { notificationTicketPath } from "@/lib/notifications/notification-kind";
import { useInboxNotifications } from "@/lib/notifications/use-inbox-notifications";
import { useSession } from "@/lib/session/use-session";
import { cn } from "@/lib/utils";
import type { InAppNotification } from "@/services/notifications-api";

export function NotificationsBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useSession();
  const inbox = useInboxNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (session === null) {
    return null;
  }

  const openPanel = () => {
    setIsOpen((current) => !current);
    void inbox.refreshList();
  };

  const onSelect = (notification: InAppNotification) => {
    void inbox.markOneRead(notification.id);
    const path = notificationTicketPath(notification.ticketId, notification.type);
    if (path !== null) {
      navigate(path);
    }
  };

  const badge =
    inbox.unreadCount > 0 ? (
      <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-danger text-[8.5px] font-bold text-on-danger tnum">
        {inbox.unreadCount > 9 ? "9+" : inbox.unreadCount}
      </span>
    ) : null;

  const panel = (
    <NotificationsPanel
      items={inbox.items}
      unreadCount={inbox.unreadCount}
      onClose={() => setIsOpen(false)}
      onSelect={onSelect}
      onMarkAllRead={() => void inbox.markAllRead()}
    />
  );

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(isOpen ? "bg-elevated text-foreground" : "text-muted-foreground")}
        aria-label={t("notifications.open")}
        onClick={openPanel}
      >
        <Bell size={16.5} strokeWidth={1.9} />
        {badge}
      </Button>
      {isCompact ? (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="right" className="flex w-full max-w-[380px] flex-col p-0">
            <SheetTitle className="sr-only">{t("notifications.title")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("notifications.title")}
            </SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      ) : isOpen ? (
        <div className={cn(floatingPanelClassName, "absolute right-0 top-11 z-50 w-[380px]")}>
          {panel}
        </div>
      ) : null}
    </div>
  );
}
