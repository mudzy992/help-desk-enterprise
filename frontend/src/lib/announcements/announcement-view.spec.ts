import { describe, expect, it } from "vitest";
import {
  acknowledgementPercent,
  fromLocalInputValue,
  modalShowsLeft,
  recordModalShown,
  severityRole,
  severityTone,
  statusTone,
  toLocalInputValue,
} from "@/lib/announcements/announcement-view";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("announcement view helpers", () => {
  it("maps severity to tone and live-region role", () => {
    expect(severityTone("CRITICAL")).toBe("danger");
    expect(severityTone("WARNING")).toBe("warning");
    expect(severityTone("INFO")).toBe("info");
    expect(severityRole("CRITICAL")).toBe("alert");
    expect(severityRole("WARNING")).toBe("status");
    expect(severityRole("INFO")).toBe("status");
  });

  it("limits a modal to three shows per session and version", () => {
    const store = memoryStore();
    expect(modalShowsLeft(store, "a1", 1)).toBe(3);
    recordModalShown(store, "a1", 1);
    recordModalShown(store, "a1", 1);
    recordModalShown(store, "a1", 1);
    expect(modalShowsLeft(store, "a1", 1)).toBe(0);
    // An edited announcement (new version) is shown again.
    expect(modalShowsLeft(store, "a1", 2)).toBe(3);
    expect(modalShowsLeft(null, "a1", 1)).toBe(3);
  });

  it("round-trips datetime-local values", () => {
    const local = toLocalInputValue(new Date(2026, 9, 1, 8, 30));
    expect(local).toBe("2026-10-01T08:30");
    expect(fromLocalInputValue(local)).toBe(new Date(2026, 9, 1, 8, 30).toISOString());
    expect(fromLocalInputValue("")).toBeNull();
    expect(toLocalInputValue("not a date")).toBe("");
  });

  it("computes the acknowledgement percentage safely", () => {
    expect(acknowledgementPercent(0, 0)).toBe(0);
    expect(acknowledgementPercent(1, 3)).toBe(33);
    expect(acknowledgementPercent(5, 4)).toBe(100);
  });

  it("gives each status a tone", () => {
    expect(statusTone("PUBLISHED")).toBe("success");
    expect(statusTone("DRAFT")).toBe("warning");
    expect(statusTone("WITHDRAWN")).toBe("danger");
  });
});
