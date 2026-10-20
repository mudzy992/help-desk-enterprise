import { describe, expect, it } from "vitest";
import { parseOnCallPageSearch, updateOnCallPageSearch } from "./on-call-page-search";

describe("on-call page search", () => {
  it("parses a shareable group/week scope and rejects invalid weeks", () => {
    expect(parseOnCallPageSearch(new URLSearchParams("group=g-1&week=-4"))).toEqual({
      groupId: "g-1",
      weekOffset: -4,
    });
    expect(parseOnCallPageSearch(new URLSearchParams("group=&week=3"))).toEqual({
      groupId: null,
      weekOffset: 0,
    });
    expect(parseOnCallPageSearch(new URLSearchParams("week=100"))).toEqual({
      groupId: null,
      weekOffset: 0,
    });
  });

  it("preserves unrelated parameters while canonicalizing defaults", () => {
    const next = updateOnCallPageSearch(new URLSearchParams("keep=yes&week=4"), {
      groupId: "g-2",
      weekOffset: 0,
    });
    expect(next.toString()).toBe("keep=yes&group=g-2");
  });
});
