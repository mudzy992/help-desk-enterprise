import { describe, expect, it } from "vitest";
import { isScrollable, needsOwnFocus } from "./scroll-region";

const base = { scrollWidth: 500, clientWidth: 500, scrollHeight: 200, clientHeight: 200, overflowX: "auto", overflowY: "visible" };

describe("scroll region focus", () => {
  it("detects horizontal overflow only when the axis can scroll", () => {
    expect(isScrollable(base)).toBe(false);
    expect(isScrollable({ ...base, scrollWidth: 800 })).toBe(true);
    expect(isScrollable({ ...base, scrollWidth: 800, overflowX: "hidden" })).toBe(false);
    expect(isScrollable({ ...base, scrollWidth: 501 })).toBe(false);
  });

  it("detects vertical overflow", () => {
    expect(isScrollable({ ...base, scrollHeight: 400, overflowY: "auto" })).toBe(true);
    expect(isScrollable({ ...base, scrollHeight: 400 })).toBe(false);
  });

  it("adds its own tab stop only when nothing inside can take focus", () => {
    expect(needsOwnFocus(true, false)).toBe(true);
    expect(needsOwnFocus(true, true)).toBe(false);
    expect(needsOwnFocus(false, false)).toBe(false);
  });
});
