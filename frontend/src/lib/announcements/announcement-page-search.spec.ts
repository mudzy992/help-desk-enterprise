import { describe, expect, it } from "vitest";
import { parseAnnouncementPageTab, updateAnnouncementPageSearch } from "./announcement-page-search";

describe("announcement page search", () => {
  it("accepts only the manage tab", () => {
    expect(parseAnnouncementPageTab("manage")).toBe("manage");
    expect(parseAnnouncementPageTab("unknown")).toBe("mine");
    expect(parseAnnouncementPageTab(null)).toBe("mine");
  });

  it("preserves deep-link and unrelated parameters during tab navigation", () => {
    const managed = updateAnnouncementPageSearch(new URLSearchParams("open=a-1&keep=yes"), {
      tab: "manage",
    });
    expect(managed.toString()).toBe("open=a-1&keep=yes&tab=manage");
    expect(updateAnnouncementPageSearch(managed, { tab: "mine" }).toString()).toBe(
      "open=a-1&keep=yes",
    );
  });
});
