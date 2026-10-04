import { describe, expect, it } from "vitest";
import {
  allSectionsOpen,
  detailSectionKeys,
  overridesForAll,
  parseDetailSectionOverrides,
  sectionOpen,
  serializeDetailSectionOverrides,
  staticDetailSectionKeys,
} from "@/lib/tickets/detail-sections";

describe("detail sections", () => {
  it("opens a section by default and lets an override win", () => {
    expect(sectionOpen("formData", {})).toBe(false);
    expect(sectionOpen("formData", { formData: true })).toBe(true);
    expect(sectionOpen("participants", {})).toBe(true);
    expect(sectionOpen("participants", { participants: false })).toBe(false);
  });

  it("treats the summary sections as always visible", () => {
    expect(staticDetailSectionKeys.has("sla")).toBe(true);
    expect(staticDetailSectionKeys.has("properties")).toBe(true);
    expect(staticDetailSectionKeys.has("participants")).toBe(false);
  });

  it("parses stored overrides without trusting the payload", () => {
    expect(parseDetailSectionOverrides(null)).toEqual({});
    expect(parseDetailSectionOverrides("not json")).toEqual({});
    expect(parseDetailSectionOverrides("[true]")).toEqual({});
    expect(parseDetailSectionOverrides('{"formData":true,"unknown":true,"links":"yes"}')).toEqual({
      formData: true,
    });
    expect(parseDetailSectionOverrides(serializeDetailSectionOverrides({ links: false }))).toEqual({
      links: false,
    });
  });

  it("expands and collapses every section at once", () => {
    const expanded = overridesForAll(detailSectionKeys, true);
    expect(allSectionsOpen(detailSectionKeys, expanded)).toBe(true);
    const collapsed = overridesForAll(detailSectionKeys, false);
    expect(allSectionsOpen(detailSectionKeys, collapsed)).toBe(false);
    // No overrides at all means the defaults decide, not "everything open".
    expect(allSectionsOpen(detailSectionKeys, {})).toBe(false);
    // Static sections are never written to storage.
    expect(expanded).not.toHaveProperty("sla");
    expect(collapsed).not.toHaveProperty("properties");
  });
});
