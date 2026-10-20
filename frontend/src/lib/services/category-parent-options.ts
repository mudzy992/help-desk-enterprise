import type { ServiceCategoryResponse } from "@/services/service-categories-api";

/** Excludes the edited category and every descendant to prevent parent cycles before submit. */
export function availableCategoryParents(
  categories: readonly ServiceCategoryResponse[],
  categoryId: string | null,
): readonly ServiceCategoryResponse[] {
  if (categoryId === null) return categories;
  const excluded = new Set([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (
        category.parentId !== null &&
        excluded.has(category.parentId) &&
        !excluded.has(category.id)
      ) {
        excluded.add(category.id);
        changed = true;
      }
    }
  }
  return categories.filter((category) => !excluded.has(category.id));
}
