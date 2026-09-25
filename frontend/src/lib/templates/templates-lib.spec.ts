import { describe, expect, it } from "vitest";
import { flattenPickerGroups, groupPickerItems, matchesPickerQuery, pickerSectionOf } from "@/lib/templates/group-picker-items";
import { insertAtCursor, isSlashTrigger } from "@/lib/templates/insert-at-cursor";
import { moveItem } from "@/lib/templates/reorder-steps";
import { parseTagsInput, unknownTemplateVariables } from "@/lib/templates/template-variables";
import { isPlaybookGuardedTransition } from "@/lib/templates/use-ticket-playbook";
import type { ResponseTemplatePickerItem } from "@/services/templates-api";

const item = (overrides: Partial<ResponseTemplatePickerItem>): ResponseTemplatePickerItem => ({
  id: "t",
  name: "Šablon",
  kind: "REPLY",
  tags: [],
  ownership: "shared",
  scopeMatch: 0,
  usageCount: 0,
  preview: "",
  hasEnglish: false,
  ...overrides,
});

describe("insertAtCursor", () => {
  it("inserts into an empty composer as is", () => {
    expect(insertAtCursor("", 0, 0, "Pozdrav")).toEqual({ value: "Pozdrav", caret: 7 });
  });

  it("adds line breaks around text in the middle of a line", () => {
    expect(insertAtCursor("abcdef", 3, 3, "X")).toEqual({ value: "abc\nX\ndef", caret: 5 });
  });

  it("replaces the selection and tolerates reversed or out-of-range positions", () => {
    expect(insertAtCursor("ab\nSTARO\ncd", 9, 3, "NOVO").value).toBe("ab\nNOVO\ncd");
    expect(insertAtCursor("ab", 99, 99, "X")).toEqual({ value: "ab\nX", caret: 4 });
  });

  it("opens the picker with / only at an empty line start", () => {
    expect(isSlashTrigger("", 0, 0)).toBe(true);
    expect(isSlashTrigger("abc\n", 4, 4)).toBe(true);
    expect(isSlashTrigger("abc", 3, 3)).toBe(false);
    expect(isSlashTrigger("abc", 0, 2)).toBe(false);
  });
});

describe("picker grouping", () => {
  const items = [
    item({ id: "g1", name: "Globalni", usageCount: 1 }),
    item({ id: "s", name: "VPN servis", scopeMatch: 3, tags: ["vpn"] }),
    item({ id: "c", name: "Kategorija", scopeMatch: 2, usageCount: 50 }),
    item({ id: "p", name: "Moj", ownership: "personal", scopeMatch: 0 }),
    item({ id: "o", name: "Drugi servis", scopeMatch: -1 }),
    item({ id: "g2", name: "Globalni češći", usageCount: 9 }),
  ];

  it("assigns sections", () => {
    expect(items.map(pickerSectionOf)).toEqual(["global", "matching", "matching", "personal", "other", "global"]);
  });

  it("orders sections and items inside them", () => {
    const groups = groupPickerItems(items, "");
    expect(groups.map((group) => group.section)).toEqual(["matching", "global", "personal", "other"]);
    expect(flattenPickerGroups(groups).map((entry) => entry.id)).toEqual(["s", "c", "g2", "g1", "p", "o"]);
  });

  it("filters by every word, ignoring case and diacritics", () => {
    expect(matchesPickerQuery(item({ name: "Čestitka" }), "cest")).toBe(true);
    expect(matchesPickerQuery(item({ name: "A", tags: ["vpn"] }), "VPN")).toBe(true);
    expect(matchesPickerQuery(item({ name: "A", preview: "reset lozinke" }), "lozinke reset")).toBe(true);
    expect(matchesPickerQuery(item({ name: "A" }), "b")).toBe(false);
    expect(groupPickerItems(items, "vpn").flatMap((group) => group.items.map((entry) => entry.id))).toEqual(["s"]);
  });
});

describe("template variables", () => {
  it("flags unknown placeholders like the backend", () => {
    expect(unknownTemplateVariables("{{ticketNumber}} {{ nope }} {{requesterName}}")).toEqual(["nope"]);
  });

  it("parses comma separated tags", () => {
    expect(parseTagsInput(" VPN, mreža ,vpn,, ")).toEqual(["vpn", "mreža"]);
  });
});

describe("moveItem", () => {
  it("moves and clamps", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    const same = ["a"];
    expect(moveItem(same, 0, 0)).toBe(same);
  });
});

describe("isPlaybookGuardedTransition", () => {
  it("mirrors the backend guard", () => {
    expect(isPlaybookGuardedTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(isPlaybookGuardedTransition("RESOLVED", "CLOSED")).toBe(false);
    expect(isPlaybookGuardedTransition("WAITING_FOR_USER", "CLOSED")).toBe(true);
  });
});
