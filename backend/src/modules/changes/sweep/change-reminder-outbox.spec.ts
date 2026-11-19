import {
  changeReminderDedupeKey,
  changeReminderDispatchMaxAttempts,
  changeReminderDispatchTopic,
  changeReminderOccurrence,
  enqueueChangeReminder,
  readChangeReminderPayload,
} from "./change-reminder-outbox";

const start = new Date("2030-05-01T08:00:00.000Z");
const end = new Date("2030-05-01T10:00:00.000Z");

describe("change reminder outbox (BA-changes-07)", () => {
  it("keys the intent to the window the notice belongs to", () => {
    expect(changeReminderOccurrence("starting_soon", { plannedStart: start, plannedEnd: end })).toBe(
      `s${start.getTime()}`,
    );
    expect(changeReminderOccurrence("overdue", { plannedStart: start, plannedEnd: end })).toBe(
      `o${end.getTime()}`,
    );
    expect(() =>
      changeReminderOccurrence("starting_soon", { plannedStart: null, plannedEnd: end }),
    ).toThrow("INVALID_CHANGE_REMINDER_OCCURRENCE");
  });

  it("produces a dedupe key the outbox accepts, stable per window", () => {
    const occurrence = changeReminderOccurrence("starting_soon", { plannedStart: start, plannedEnd: end });
    const key = changeReminderDedupeKey("clx0change0000abcd", "starting_soon", occurrence);

    expect(key).toBe(`change-reminder:starting_soon:clx0change0000abcd:${occurrence}`);
    expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u);
    // A moved window is a different notice; the same window is the same notice.
    const moved = changeReminderDedupeKey(
      "clx0change0000abcd",
      "starting_soon",
      changeReminderOccurrence("starting_soon", { plannedStart: new Date(start.getTime() + 60_000), plannedEnd: end }),
    );
    expect(moved).not.toBe(key);
  });

  it("enqueues the topic, attempts and payload through the caller transaction", async () => {
    const transaction = { marker: "tx" };
    const enqueue = jest.fn(async () => ({ id: "outbox-1", created: true }));
    const payload = { changeId: "change-1", kind: "overdue" as const, occurrence: `o${end.getTime()}` };

    const result = await enqueueChangeReminder({ enqueue } as never, transaction as never, payload);

    expect(result).toEqual({ id: "outbox-1", created: true });
    expect(enqueue).toHaveBeenCalledWith(transaction, {
      topic: changeReminderDispatchTopic,
      dedupeKey: changeReminderDedupeKey("change-1", "overdue", `o${end.getTime()}`),
      payload,
      maxAttempts: changeReminderDispatchMaxAttempts,
    });
  });

  it("round-trips the payload and refuses anything else", () => {
    const payload = { changeId: "change-1", kind: "starting_soon", occurrence: `s${start.getTime()}` };
    expect(readChangeReminderPayload(payload)).toEqual(payload);

    const malformed = [
      null,
      [],
      {},
      { changeId: "", kind: "overdue", occurrence: "o1" },
      { changeId: "change-1", kind: "later", occurrence: "o1" },
      { changeId: "change-1", kind: "overdue", occurrence: "x1" },
      { changeId: "change-1", kind: "overdue", occurrence: "o" },
      { changeId: "change-1", kind: "overdue", occurrence: 17 },
    ];
    for (const value of malformed) {
      expect(() => readChangeReminderPayload(value)).toThrow("INVALID_CHANGE_REMINDER_PAYLOAD");
    }
  });
});
