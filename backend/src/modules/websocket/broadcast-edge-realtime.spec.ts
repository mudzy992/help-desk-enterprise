import { broadcastEdgeEventRealtime } from "./broadcast-edge-realtime";

describe("broadcastEdgeEventRealtime", () => {
  it.each([
    "notification.created",
    "notification.read",
    "notification.unread-count",
    "time.timer.changed",
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

  it("limits unknown recipient-specific edge events to the intended user room", () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    broadcastEdgeEventRealtime({ to } as never, {
      userId: "user-1",
      ticketId: "ticket-1",
      eventName: "edge.ticket.activity",
      data: {},
    });
    expect(to.mock.calls).toEqual([["user:user-1"]]);
  });
});
