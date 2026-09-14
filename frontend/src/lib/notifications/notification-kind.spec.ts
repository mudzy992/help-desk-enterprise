import { describe, expect, it } from "vitest";
import { notificationKind, notificationTicketPath, notificationTitleKey } from "./notification-kind";

describe("notification helpers", () => {
  it("maps type to kind, title key, and ticket path", () => {
    expect(notificationKind("ticket.sla")).toBe("sla");
    expect(notificationKind("ticket.approval")).toBe("approval");
    expect(notificationKind("unknown")).toBe("system");
    expect(notificationTitleKey("ticket.created")).toBe(
      "notifications.items.ticketCreated",
    );
    expect(notificationTitleKey("remote.requested")).toBe(
      "notifications.items.remoteRequested",
    );
    expect(notificationTicketPath("ticket-1")).toBe("/tickets/ticket-1");
    expect(notificationTicketPath(null)).toBeNull();
  });
});
