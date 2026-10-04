import type { TFunction } from "i18next";

/**
 * Faza 3 (c): naziv dijela wikija. Server šalje BS naziv (`label`) kao fallback,
 * a UI prevodi preko `docs.parts.<key>` — tako EN prikaz ne zavisi od sadržaja.
 */
export const docsPartTranslationKeys = {
  pocetak: "docs.parts.pocetak",
  korisnik: "docs.parts.korisnik",
  agent: "docs.parts.agent",
  administrator: "docs.parts.administrator",
  operativa: "docs.parts.operativa",
  referenca: "docs.parts.referenca",
} as const;

export function docsPartLabel(
  t: TFunction,
  part: { readonly key: string; readonly label: string },
): string {
  const key = docsPartTranslationKeys[part.key as keyof typeof docsPartTranslationKeys];
  if (key === undefined) {
    return part.label;
  }
  const translated = t(key);
  return translated === key ? part.label : translated;
}
