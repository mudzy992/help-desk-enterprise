import { describe, expect, it } from "vitest";
import {
  applyNotificationCreated,
  applyNotificationRead,
} from "./apply-notification-realtime";
import type { InAppNotification } from "@/services/notifications-api";

const item = (id: string, isRead = false): InAppNotification => ({
  id,
  type: "ticket.assigned",
  title: "Assigned",
  body: "T-1",
  isRead,
  readAt: isRead ? "2026-09-13T08:00:00.000Z" : null,
  ticketId: "ticket-1",
  payload: null,
  createdAt: "2026-09-13T08:00:00.000Z",
});

describe("notification realtime helpers", () => {
  it("dedupes created notifications and updates unread count payloads independently", () => {
    const created = {
      notification: item("n1"),
      unreadCount: 2,
      readAll: false,
      occurredAt: "2026-09-13T08:00:00.000Z",
    };
    const once = applyNotificationCreated([], created);
    const twice = applyNotificationCreated(once, created);
    expect(once).toHaveLength(1);
    expect(twice).toHaveLength(1);
  });

  it("marks one or all notifications read without duplicating rows", () => {
    const current = [item("n1"), item("n2")];
    const one = applyNotificationRead(current, {
      notification: item("n1", true),
      unreadCount: 1,
      readAll: false,
      occurredAt: "2026-09-13T08:01:00.000Z",
    });
    expect(one.filter((row) => row.isRead)).toHaveLength(1);
    const all = applyNotificationRead(current, {
      notification: null,
      unreadCount: 0,
      readAll: true,
      occurredAt: "2026-09-13T08:01:00.000Z",
    });
    expect(all.every((row) => row.isRead)).toBe(true);
    expect(all).toHaveLength(2);
  });
});
