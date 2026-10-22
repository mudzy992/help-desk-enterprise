import { describe, expect, it } from "vitest";
import { emptyAnnouncementDraft, toggleAnnouncementAudience } from "./announcement-editor-model";

describe("announcement editor model", () => {
  it("creates a deterministic seven-day draft window", () => {
    const draft = emptyAnnouncementDraft(Date.parse("2026-10-22T10:01:00Z"));
    const durationHours = (Date.parse(draft.endsAt) - Date.parse(draft.startsAt)) / 3_600_000;
    expect(durationHours).toBeGreaterThanOrEqual(167);
    expect(durationHours).toBeLessThanOrEqual(169);
    expect(draft.severity).toBe("INFO");
    expect(draft.displayMode).toBe("BANNER");
  });

  it("adds audience values uniquely and removes them", () => {
    expect(toggleAnnouncementAudience(["AGENT"], "AGENT", true)).toEqual(["AGENT"]);
    expect(toggleAnnouncementAudience(["AGENT"], "ADMIN", true)).toEqual(["AGENT", "ADMIN"]);
    expect(toggleAnnouncementAudience(["AGENT", "ADMIN"], "AGENT", false)).toEqual(["ADMIN"]);
  });
});
