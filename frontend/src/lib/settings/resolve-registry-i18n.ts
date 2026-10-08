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

/**
 * Paket 5.3.4 (D4): the human line for a setting. The dictionary slot has
 * carried the Bosnian/English sentence since paket 4.1, so a definition only
 * moves it by declaring `titleKey`.
 */
export function resolveRegistryTitle(
  translate: TFunction,
  entry: {
    readonly key: string;
    readonly titleKey: string;
    readonly description: string;
  },
): string {
  const titled = readTranslation(translate, entry.titleKey);
  if (titled !== null) {
    return titled;
  }
  return resolveRegistryDescription(translate, entry.key, entry.description);
}

/**
 * Paket 5.3.3: the extra note in the detail modal ("what it does, when to turn
 * it on, what happens next"). Only settings that need one carry it — a missing
 * help slot is not an error and returns `null`.
 */
export function resolveRegistryHelp(
  translate: TFunction,
  entry: { readonly helpKey: string },
): string | null {
  return readTranslation(translate, entry.helpKey);
}

/** Group title inside a category; falls back to `null` (no heading). */
export function resolveRegistryGroupTitle(
  translate: TFunction,
  categoryId: string,
  groupId: string,
): string | null {
  return readTranslation(
    translate,
    `settings.registry.groups.${categoryId}.${groupId}`,
  );
}

/**
 * Reads one slot and treats "not translated" as absent. i18next answers a
 * missing key with the key itself (`returnNull: false`, `returnEmptyString:
 * false` in the app config), so that answer is filtered out here instead of
 * leaking `settings.registry.help.x` into the screen.
 */
function readTranslation(translate: TFunction, key: string): string | null {
  const value = translate(key, { defaultValue: "" });
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (text.length === 0 || text === key || text.endsWith(`:${key}`)) {
    return null;
  }
  return text;
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
