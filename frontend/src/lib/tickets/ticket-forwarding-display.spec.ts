import { describe, expect, it } from "vitest";
import {
  describeLastForward,
  forwardCountOf,
  isForwardPingPong,
} from "@/lib/tickets/ticket-forwarding-display";

describe("ticket forwarding display (package 1.6)", () => {
  it("treats missing or zero counts as not forwarded", () => {
    expect(forwardCountOf({})).toBe(0);
    expect(forwardCountOf({ forwardCount: 0 })).toBe(0);
    expect(forwardCountOf({ forwardCount: 2 })).toBe(2);
  });

  it("flags ping-pong from three forwards", () => {
    expect(isForwardPingPong({ forwardCount: 2 })).toBe(false);
    expect(isForwardPingPong({ forwardCount: 3 })).toBe(true);
  });

  it("describes the last forward", () => {
    const described = describeLastForward(
      { lastForwardedAt: "2026-09-25T12:20:00.000Z", lastForwardFromGroupName: " Mreža " },
      "bs",
    );
    expect(described.from).toBe("Mreža");
    expect(described.when).not.toBeNull();
    expect(describeLastForward({}, "bs")).toEqual({ when: null, from: null });
  });
});
