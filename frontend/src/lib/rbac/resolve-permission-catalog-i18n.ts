import type { TFunction } from "i18next";

export function resolvePermissionDescription(
  translate: TFunction,
  key: string,
  backendDescription: string,
): string {
  const catalog = translate("permissions.catalog.keys", {
    returnObjects: true,
  });
  if (
    typeof catalog === "object" &&
    catalog !== null &&
    !Array.isArray(catalog)
  ) {
    const override = (catalog as Record<string, unknown>)[key];
    if (typeof override === "string" && override.trim().length > 0) {
      return override;
    }
  }
  return backendDescription;
}

export function resolvePermissionCategoryTitle(
  translate: TFunction,
  categoryId: string,
): string {
  const catalog = translate("permissions.catalog.categories", {
    returnObjects: true,
  });
  if (
    typeof catalog === "object" &&
    catalog !== null &&
    !Array.isArray(catalog)
  ) {
    const override = (catalog as Record<string, unknown>)[categoryId];
    if (typeof override === "string" && override.trim().length > 0) {
      return override;
    }
  }
  return categoryId;
}
