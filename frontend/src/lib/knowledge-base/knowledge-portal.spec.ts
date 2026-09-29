import { describe, expect, it } from "vitest";
import {
  buildKnowledgeCategoryTree,
  canSubmitKnowledgeRating,
  formatAverageRating,
  knowledgeCategoryName,
  ratingAllowsComment,
  suggestCategoryKey,
  totalReplacements,
} from "./knowledge-portal";

const category = (id: string, parentId: string | null, sortOrder: number, nameBs = id) => ({
  id,
  key: id,
  nameBs,
  nameEn: `${nameBs} EN`,
  icon: "wifi",
  sortOrder,
  parentId,
  isArchived: false,
});

describe("knowledge portal helpers (K1)", () => {
  it("builds a one-level tree in sort order; orphans become roots", () => {
    const tree = buildKnowledgeCategoryTree([
      category("b", null, 2),
      category("a", null, 1),
      category("a2", "a", 2),
      category("a1", "a", 1),
      category("orphan", "missing", 3),
    ]);
    expect(tree.map((node) => node.id)).toEqual(["a", "b", "orphan"]);
    expect(tree[0].children.map((child) => child.id)).toEqual(["a1", "a2"]);
  });

  it("picks the category name by language", () => {
    expect(knowledgeCategoryName(category("x", null, 0, "Mreža"), "bs")).toBe("Mreža");
    expect(knowledgeCategoryName(category("x", null, 0, "Mreža"), "en")).toBe("Mreža EN");
  });

  it("allows a comment only for 1-2 stars", () => {
    expect(ratingAllowsComment(2)).toBe(true);
    expect(ratingAllowsComment(3)).toBe(false);
    expect(canSubmitKnowledgeRating(null, "")).toBe(false);
    expect(canSubmitKnowledgeRating(5, "")).toBe(true);
    expect(canSubmitKnowledgeRating(4, "nedostaje")).toBe(false);
    expect(canSubmitKnowledgeRating(1, "nedostaje korak")).toBe(true);
    expect(canSubmitKnowledgeRating(1, "x".repeat(501))).toBe(false);
  });

  it("formats averages and totals", () => {
    expect(formatAverageRating(null, "bs")).toBeNull();
    expect(formatAverageRating(4.5, "en")).toBe("4.5");
    expect(totalReplacements({ email: 1, person: 2, ip: 0, phone: 3 })).toBe(6);
  });

  it("suggests ASCII category keys", () => {
    expect(suggestCategoryKey("Mreža i VPN")).toBe("mreza-i-vpn");
    expect(suggestCategoryKey("Đački  Računi!")).toBe("djacki-racuni");
  });
});
