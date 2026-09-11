import { describe, expect, it } from "vitest";
import { paginateItems } from "@/lib/tickets/paginate-items";

describe("paginateItems", () => {
  it("slices a page and clamps out-of-range pages", () => {
    const items = [1, 2, 3, 4, 5];
    expect(paginateItems(items, 2, 2)).toEqual({
      pageItems: [3, 4],
      totalPages: 3,
      page: 2,
    });
    expect(paginateItems(items, 99, 2).page).toBe(3);
    expect(paginateItems([], 1, 25)).toEqual({
      pageItems: [],
      totalPages: 1,
      page: 1,
    });
  });
});
