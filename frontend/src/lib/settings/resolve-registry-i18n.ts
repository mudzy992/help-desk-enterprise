import type { TFunction } from "i18next";

export function resolveRegistryDescription(
  translate: TFunction,
  key: string,
  backendDescription: string,
): string {
  const catalog = translate("settings.registry.keys", {
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

export function resolveRegistryCategoryTitle(
  translate: TFunction,
  categoryKey: string,
): string {
  const catalog = translate("settings.registry.categories", {
    returnObjects: true,
  });
  if (
    typeof catalog === "object" &&
    catalog !== null &&
    !Array.isArray(catalog)
  ) {
    const override = (catalog as Record<string, unknown>)[categoryKey];
    if (typeof override === "string" && override.trim().length > 0) {
      return override;
    }
  }
  return categoryKey;
}
