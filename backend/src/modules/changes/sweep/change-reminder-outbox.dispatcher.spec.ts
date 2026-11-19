import { ChangeReminderOutboxDispatcher } from "./change-reminder-outbox.dispatcher";
import { changeReminderDispatchTopic } from "./change-reminder-outbox";

function delivery(kind: "starting_soon" | "overdue", changeId = "change-1") {
  return {
    id: "outbox-1",
    topic: changeReminderDispatchTopic,
    dedupeKey: "change-reminder:starting_soon:change-1:s1",
    payload: { changeId, kind, occurrence: "s1" },
    attempts: 1,
    maxAttempts: 8,
    ownerToken: "owner",
  };
}

describe("ChangeReminderOutboxDispatcher (BA-changes-07)", () => {
  const notifier = { startingSoon: jest.fn(), overdue: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it("dispatches only through the outbox and stops when it is idle", async () => {
    const outbox = {
      dispatchOne: jest
        .fn()
        .mockResolvedValueOnce("succeeded")
        .mockResolvedValueOnce("retry")
        .mockResolvedValueOnce("idle"),
    };
    const dispatcher = new ChangeReminderOutboxDispatcher(outbox as never, notifier as never);

    await dispatcher.drain();

    expect(outbox.dispatchOne).toHaveBeenCalledTimes(3);
    expect(outbox.dispatchOne).toHaveBeenCalledWith(changeReminderDispatchTopic, expect.any(Function));
    expect(notifier.startingSoon).not.toHaveBeenCalled();
  });

  it("delivers the notice matching the persisted kind", async () => {
    const handlers: Array<(value: unknown) => Promise<void>> = [];
    const outbox = {
      dispatchOne: jest.fn(async (_topic: string, handler: (value: unknown) => Promise<void>) => {
        handlers.push(handler);
        return handlers.length === 1 ? "succeeded" : "idle";
      }),
    };
    const dispatcher = new ChangeReminderOutboxDispatcher(outbox as never, notifier as never);

    await dispatcher.drain();
    await handlers[0]!(delivery("starting_soon", "change-7"));
    await handlers[1]!(delivery("overdue", "change-8"));

    expect(notifier.startingSoon).toHaveBeenCalledWith("change-7");
    expect(notifier.overdue).toHaveBeenCalledWith("change-8");
  });

  it("lets delivery failures reach the outbox for retry", async () => {
    const outbox = {
      dispatchOne: jest.fn(async (_topic: string, handler: (value: unknown) => Promise<void>) => {
        await handler(delivery("overdue"));
        return "retry";
      }),
    };
    notifier.overdue.mockRejectedValue(new Error("smtp down"));
    const dispatcher = new ChangeReminderOutboxDispatcher(outbox as never, notifier as never);

    await expect(dispatcher.drain()).rejects.toThrow("smtp down");
  });

  it("refuses a malformed payload instead of sending a wrong notice", async () => {
    let seen: unknown;
    const outbox = {
      dispatchOne: jest.fn(async (_topic: string, handler: (value: unknown) => Promise<void>) => {
        if (seen === undefined) {
          seen = "running";
          await handler({ ...delivery("overdue"), payload: { changeId: "change-1" } });
          return "succeeded";
        }
        return "idle";
      }),
    };
    const dispatcher = new ChangeReminderOutboxDispatcher(outbox as never, notifier as never);

    await expect(dispatcher.drain()).rejects.toThrow("INVALID_CHANGE_REMINDER_PAYLOAD");
    expect(notifier.overdue).not.toHaveBeenCalled();
    expect(notifier.startingSoon).not.toHaveBeenCalled();
  });
});
