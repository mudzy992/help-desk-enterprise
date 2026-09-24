import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  notificationKind,
  notificationTicketPath,
  notificationTitleKey,
  type NotificationKind,
} from "@/lib/notifications/notification-kind";
import { useInboxNotifications } from "@/lib/notifications/use-inbox-notifications";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";

const KIND_DOT: Record<NotificationKind, string> = {
  ticket: SEMANTIC_DOT_HEX.primary,
  sla: SEMANTIC_DOT_HEX.danger,
  approval: SEMANTIC_DOT_HEX.warning,
  system: SEMANTIC_DOT_HEX.info,
};

export function DashboardActivityFeed() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { items, refreshList } = useInboxNotifications();

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("dashboard.activityTitle")}
        subtitle={t("dashboard.activitySubtitle")}
      />
      {items.length === 0 ? (
        <EmptyState
          title={t("dashboard.activityEmpty")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets">{t("dashboard.viewAll")}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="max-h-[300px] divide-y divide-border/50 overflow-y-auto">
          {items.map((notification) => {
            const kind = notificationKind(notification.type);
            const path = notificationTicketPath(
              notification.ticketId,
              notification.type,
            );
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  disabled={path === null}
                  onClick={() => {
                    if (path !== null) {
                      navigate(path);
                    }
                  }}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{ background: KIND_DOT[kind] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] leading-[18px] text-foreground/85">
                      {t(notificationTitleKey(notification.type), {
                        ticketNumber:
                          notification.payload?.ticketNumber ?? "",
                      })}
                    </span>
                    {notification.body ? (
                      <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                        {notification.body}
                      </span>
                    ) : null}
                    <RelativeTime
                      value={notification.createdAt}
                      locale={i18n.language}
                      className="mt-0.5 block text-[10.5px] text-muted-foreground/70"
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
