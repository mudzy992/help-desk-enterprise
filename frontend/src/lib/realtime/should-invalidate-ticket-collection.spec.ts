import { describe, expect, it } from "vitest";
import type { NotificationRealtimePayload } from "./apply-notification-realtime";
import {
  shouldInvalidateTicketCollectionFromNotification,
  shouldInvalidateTicketCollectionFromUpdated,
} from "./should-invalidate-ticket-collection";

const assignedNotification = {
  id: "n1",
  type: "ticket.assigned",
  title: "Assigned",
  body: "T-1",
  isRead: false,
  readAt: null,
  ticketId: "ticket-1",
  payload: null,
  createdAt: "2026-09-13T08:00:00.000Z",
} as const;

const notificationPayload = (
  extra: Partial<NotificationRealtimePayload> = {},
): NotificationRealtimePayload => ({
  notification: assignedNotification,
  unreadCount: 1,
  readAll: false,
  occurredAt: "2026-09-13T08:00:00.000Z",
  ...extra,
});

describe("shouldInvalidateTicketCollection", () => {
  it("reloads on ticket.updated when the event has a ticket id", () => {
    expect(
      shouldInvalidateTicketCollectionFromUpdated({ ticketId: "ticket-1" }),
    ).toBe(true);
    expect(shouldInvalidateTicketCollectionFromUpdated({ ticketId: "" })).toBe(
      false,
    );
  });

  it("reloads on notification.created for ticket-scoped and ticket-less rows", () => {
    expect(
      shouldInvalidateTicketCollectionFromNotification(notificationPayload()),
    ).toBe(true);
    expect(
      shouldInvalidateTicketCollectionFromNotification(
        notificationPayload({
          notification: { ...assignedNotification, ticketId: null },
        }),
      ),
    ).toBe(true);
    expect(
      shouldInvalidateTicketCollectionFromNotification(
        notificationPayload({ notification: null }),
      ),
    ).toBe(false);
  });
});
