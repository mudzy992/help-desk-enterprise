import type { ResponseTemplatePickerItem } from "@/services/templates-api";

export type PickerSection = "matching" | "global" | "personal" | "other";
export const pickerSections: readonly PickerSection[] = ["matching", "global", "personal", "other"];

export function pickerSectionOf(item: ResponseTemplatePickerItem): PickerSection {
  if (item.ownership === "personal") return "personal";
  if (item.scopeMatch > 0) return "matching";
  if (item.scopeMatch === 0) return "global";
  return "other";
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("bs");
}

/** Every word of the query must appear in the name, a tag or the text. */
export function matchesPickerQuery(item: ResponseTemplatePickerItem, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return true;
  const haystack = normalize([item.name, ...item.tags, item.preview].join(" "));
  return words.every((word) => haystack.includes(word));
}

/**
 * Paket 1.4 (T5): templates matching the ticket first (service → category →
 * group), then global, then personal, then the rest ("show all"); inside a
 * section the most used first, then by name.
 */
export function groupPickerItems(
  items: readonly ResponseTemplatePickerItem[],
  query: string,
): readonly { readonly section: PickerSection; readonly items: readonly ResponseTemplatePickerItem[] }[] {
  const filtered = items.filter((item) => matchesPickerQuery(item, query));
  return pickerSections
    .map((section) => ({
      section,
      items: filtered
        .filter((item) => pickerSectionOf(item) === section)
        .sort(
          (a, b) =>
            b.scopeMatch - a.scopeMatch ||
            b.usageCount - a.usageCount ||
            a.name.localeCompare(b.name, "bs"),
        ),
    }))
    .filter((group) => group.items.length > 0);
}

/** Flat order used by ↑/↓ navigation (same order as rendered). */
export function flattenPickerGroups(
  groups: ReturnType<typeof groupPickerItems>,
): readonly ResponseTemplatePickerItem[] {
  return groups.flatMap((group) => group.items);
}
