import { describe, expect, it } from "vitest";
import { notificationKind, notificationTicketPath, notificationTitleKey } from "./notification-kind";

const TICKET_ID = "ticket-1";
const TICKET_PATH = `/tickets/${TICKET_ID}`;

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

  it("opens the same ticket for every known kind, including sla and approval", () => {
    const types = [
      "ticket.created",
      "ticket.assigned",
      "ticket.message",
      "ticket.resolved",
      "ticket.closed",
      "ticket.approval",
      "ticket.sla",
      "remote.requested",
    ] as const;
    for (const type of types) {
      expect(notificationTicketPath(TICKET_ID, type)).toBe(TICKET_PATH);
    }
  });

  it("does not throw on unknown kind and falls back without a crash", () => {
    expect(() => notificationTicketPath(TICKET_ID, "not-a-real-kind")).not.toThrow();
    expect(notificationTicketPath(TICKET_ID, "not-a-real-kind")).toBe(TICKET_PATH);
    expect(notificationTicketPath(null, "not-a-real-kind")).toBeNull();
    expect(notificationTicketPath(undefined, "unknown")).toBeNull();
    expect(notificationTicketPath("", "ticket.sla")).toBeNull();
  });
});

describe("directory sync notifications (paket 1.8)", () => {
  it("routes the aborted sync to the organizational units page", () => {
    expect(notificationTicketPath(null, "directory.syncAborted")).toBe("/organizational-units");
    expect(notificationTitleKey("directory.syncAborted")).toBe("notifications.items.directorySyncAborted");
    expect(notificationKind("directory.syncAborted")).toBe("system");
  });
});
