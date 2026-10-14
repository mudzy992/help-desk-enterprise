import { describe, expect, it } from "vitest";
import { createLatestRequestGate } from "@/lib/tickets/latest-request-gate";

describe("createLatestRequestGate", () => {
  it("keeps only the newest request as the one on screen", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isLatest(first)).toBe(false);
    expect(gate.isLatest(second)).toBe(true);
  });

  it("counts every request separately, so a repeated filter change is never reused", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();
    const third = gate.begin();

    expect([first, second, third]).toEqual([1, 2, 3]);
    expect(gate.isLatest(third)).toBe(true);
    expect(gate.isLatest(second)).toBe(false);
  });

  it("keeps one request per screen: two gates do not share their numbers", () => {
    const listGate = createLatestRequestGate();
    const inboxGate = createLatestRequestGate();
    listGate.begin();
    listGate.begin();
    const inboxRequest = inboxGate.begin();

    expect(inboxGate.isLatest(inboxRequest)).toBe(true);
  });
});
