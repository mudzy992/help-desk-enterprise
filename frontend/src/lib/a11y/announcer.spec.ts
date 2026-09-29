import { afterEach, describe, expect, it } from "vitest";
import { announce, resetAnnouncerForTests, subscribeToAnnouncements, type Announcement } from "./announcer";

describe("announcer", () => {
  let now = 0;
  afterEach(() => resetAnnouncerForTests());

  function collect(): Announcement[] {
    now = 0;
    resetAnnouncerForTests(() => now);
    const received: Announcement[] = [];
    subscribeToAnnouncements((item) => received.push(item));
    return received;
  }

  it("delivers polite announcements by default", () => {
    const received = collect();
    expect(announce("Sačuvano")).toBe(true);
    expect(received).toEqual([{ id: 1, message: "Sačuvano", politeness: "polite" }]);
  });

  it("ignores blank messages", () => {
    const received = collect();
    expect(announce("   ")).toBe(false);
    expect(received).toHaveLength(0);
  });

  it("throttles the same dedupe key and releases it after the window", () => {
    const received = collect();
    announce("Amra piše…", { dedupeKey: "typing:amra", throttleMs: 15_000 });
    now = 5_000;
    expect(announce("Amra piše…", { dedupeKey: "typing:amra", throttleMs: 15_000 })).toBe(false);
    now = 15_000;
    expect(announce("Amra piše…", { dedupeKey: "typing:amra", throttleMs: 15_000 })).toBe(true);
    expect(received).toHaveLength(2);
  });

  it("keeps different keys independent and honours assertive", () => {
    const received = collect();
    announce("A");
    announce("Greška", { politeness: "assertive" });
    expect(received.map((item) => item.politeness)).toEqual(["polite", "assertive"]);
  });

  it("stops delivering after unsubscribe", () => {
    now = 0;
    resetAnnouncerForTests(() => now);
    const received: Announcement[] = [];
    const stop = subscribeToAnnouncements((item) => received.push(item));
    stop();
    announce("X");
    expect(received).toHaveLength(0);
  });
});
