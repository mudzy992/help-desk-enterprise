import { describe, expect, it } from "vitest";
import { availableCategoryParents } from "@/lib/services/category-parent-options";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";

const category = (id: string, parentId: string | null) =>
  ({ id, parentId, name: id }) as ServiceCategoryResponse;

describe("availableCategoryParents", () => {
  it("excludes the edited category and descendants at every depth", () => {
    const categories = [
      category("root", null),
      category("child", "root"),
      category("grandchild", "child"),
      category("other", null),
    ];
    expect(availableCategoryParents(categories, "root").map((item) => item.id)).toEqual(["other"]);
    expect(availableCategoryParents(categories, "child").map((item) => item.id)).toEqual([
      "root",
      "other",
    ]);
  });
});
