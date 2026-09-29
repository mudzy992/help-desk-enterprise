import { describe, expect, it } from "vitest";
import { ariaKeyShortcuts, isSingleKeyShortcut, shortcutById, shortcutCatalog, type ShortcutId } from "./catalog";
import { createSequenceMatcher, dispatchableIds, normaliseKey, shouldIgnoreTarget } from "./engine";

const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});
const all = new Set<ShortcutId>(shortcutCatalog.map((item) => item.id));

describe("shortcut catalogue", () => {
  it("has no two shortcuts with the same sequence in overlapping contexts", () => {
    const seen = new Map<string, string>();
    for (const item of shortcutCatalog) {
      const contexts = item.context === "global" ? ["global", "list", "detail"] : [item.context];
      for (const context of contexts) {
        const signature = `${context}:${item.sequence.join(" ")}`;
        expect(seen.get(signature), signature).toBeUndefined();
        seen.set(signature, item.id);
      }
    }
  });

  it("marks modifier chords as not single-key (WCAG 2.1.4)", () => {
    expect(isSingleKeyShortcut(shortcutById.get("palette")!)).toBe(false);
    expect(isSingleKeyShortcut(shortcutById.get("newTicket")!)).toBe(true);
    expect(isSingleKeyShortcut(shortcutById.get("goTickets")!)).toBe(true);
  });

  it("builds aria-keyshortcuts", () => {
    expect(ariaKeyShortcuts("claim")).toBe("C");
    expect(ariaKeyShortcuts("palette")).toBe("Control+K");
    expect(ariaKeyShortcuts("nextTicket")).toBe("]");
    expect(ariaKeyShortcuts("goTickets")).toBe("");
  });
});

describe("normaliseKey", () => {
  it("lower-cases letters, maps modifiers and named keys", () => {
    expect(normaliseKey(key("J"))).toBe("j");
    expect(normaliseKey(key("k", { ctrlKey: true }))).toBe("mod+k");
    expect(normaliseKey(key("K", { metaKey: true }))).toBe("mod+k");
    expect(normaliseKey(key("Enter", { ctrlKey: true }))).toBe("mod+enter");
    expect(normaliseKey(key("?", { shiftKey: true }))).toBe("?");
    expect(normaliseKey(key("N", { shiftKey: true }))).toBe("shift+n");
  });

  it("ignores Alt chords and bare modifiers", () => {
    expect(normaliseKey(key("n", { altKey: true }))).toBeNull();
    expect(normaliseKey(key("Shift"))).toBeNull();
    expect(normaliseKey(key("ArrowDown"))).toBeNull();
  });
});

describe("sequence matcher", () => {
  it("matches single keys and two-key sequences", () => {
    const matcher = createSequenceMatcher(shortcutCatalog);
    expect(matcher.feed("n", 0, all)).toBe("newTicket");
    expect(matcher.feed("g", 10, all)).toBe("pending");
    expect(matcher.feed("t", 20, all)).toBe("goTickets");
  });

  it("drops an expired prefix", () => {
    const matcher = createSequenceMatcher(shortcutCatalog, 1_000);
    expect(matcher.feed("g", 0, all)).toBe("pending");
    expect(matcher.feed("t", 2_000, all)).toBeNull();
  });

  it("falls back to the key alone when the prefix does not continue", () => {
    const matcher = createSequenceMatcher(shortcutCatalog);
    expect(matcher.feed("g", 0, all)).toBe("pending");
    expect(matcher.feed("n", 10, all)).toBe("newTicket");
  });

  it("does not let 'g s' be stolen by the detail 's' when both are active", () => {
    const matcher = createSequenceMatcher(shortcutCatalog);
    matcher.feed("g", 0, all);
    expect(matcher.feed("s", 10, all)).toBe("goStatus");
    expect(matcher.feed("s", 20, all)).toBe("status");
  });

  it("only matches active ids", () => {
    const matcher = createSequenceMatcher(shortcutCatalog);
    expect(matcher.feed("c", 0, new Set<ShortcutId>(["newTicket"]))).toBeNull();
  });
});

describe("dispatchableIds", () => {
  const registered = new Set<ShortcutId>(["palette", "newTicket", "send", "claim"]);

  it("drops single keys when disabled or while typing, keeps chords", () => {
    expect([...dispatchableIds(shortcutCatalog, registered, { singleKeysEnabled: false, ignoreSingleKeys: false })]).toEqual(["palette"]);
    expect([...dispatchableIds(shortcutCatalog, registered, { singleKeysEnabled: true, ignoreSingleKeys: true })]).toEqual(["palette"]);
  });

  it("never dispatches component-handled entries", () => {
    expect(dispatchableIds(shortcutCatalog, registered, { singleKeysEnabled: true, ignoreSingleKeys: false })).toEqual(
      new Set(["palette", "newTicket", "claim"]),
    );
  });
});

describe("shouldIgnoreTarget", () => {
  const target = (matches: string[]) => ({ closest: (selector: string) => (matches.some((m) => selector.includes(m)) ? {} : null) });

  it("ignores typing targets, dialogs and an open modal", () => {
    expect(shouldIgnoreTarget(target(["textarea"]), false)).toBe(true);
    expect(shouldIgnoreTarget(target(["role='dialog'"]), false)).toBe(true);
    expect(shouldIgnoreTarget(null, true)).toBe(true);
    expect(shouldIgnoreTarget(target([]), false)).toBe(false);
  });
});
