import { broadcastEdgeEventRealtime } from "./broadcast-edge-realtime";

describe("broadcastEdgeEventRealtime", () => {
  it.each([
    "notification.created",
    "notification.read",
    "notification.unread-count",
  ])("delivers %s only to the intended user room", (eventName) => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    broadcastEdgeEventRealtime({ to } as never, {
      userId: "user-1",
      ticketId: "ticket-1",
      eventName,
      data: { unreadCount: 1 },
    });
    expect(to.mock.calls).toEqual([["user:user-1"]]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(eventName, { unreadCount: 1 });
  });

  it("preserves existing ticket-room delivery for a non-notification edge event", () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    broadcastEdgeEventRealtime({ to } as never, {
      userId: "user-1",
      ticketId: "ticket-1",
      eventName: "edge.ticket.activity",
      data: {},
    });
    expect(to.mock.calls).toEqual([["user:user-1"], ["ticket:ticket-1"]]);
  });
});
