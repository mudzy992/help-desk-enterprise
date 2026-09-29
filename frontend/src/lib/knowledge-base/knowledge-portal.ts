import type { KnowledgeCategory, KnowledgeReplyReplacements } from "@/services/knowledge-portal-api";

/** Paket 2.9 (K1): pure helpers of the knowledge portal. */

export const knowledgeCategoryIconNames = [
  "book-open",
  "key-round",
  "laptop",
  "monitor",
  "printer",
  "wifi",
  "mail",
  "phone",
  "shield",
  "users",
  "file-text",
  "wrench",
  "database",
  "cloud",
  "settings",
  "help-circle",
] as const;

export const commentMaxLength = 500;

export function knowledgeCategoryName(
  category: Pick<KnowledgeCategory, "nameBs" | "nameEn">,
  language: string,
): string {
  return language.startsWith("en") ? category.nameEn : category.nameBs;
}

export type KnowledgeCategoryNode<T extends KnowledgeCategory> = T & {
  readonly children: readonly T[];
};

/** Roots in sort order, each with its (one level of) children. Orphans become roots. */
export function buildKnowledgeCategoryTree<T extends KnowledgeCategory>(
  categories: readonly T[],
): readonly KnowledgeCategoryNode<T>[] {
  const byOrder = [...categories].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.nameBs.localeCompare(right.nameBs, "bs"),
  );
  const ids = new Set(byOrder.map((category) => category.id));
  return byOrder
    .filter((category) => category.parentId === null || !ids.has(category.parentId))
    .map((root) => ({
      ...root,
      children: byOrder.filter((child) => child.parentId === root.id),
    }));
}

/** A comment ("What is missing?") is offered and accepted only for 1-2 stars. */
export function ratingAllowsComment(rating: number | null): boolean {
  return rating !== null && rating >= 1 && rating <= 2;
}

export function canSubmitKnowledgeRating(rating: number | null, comment: string): boolean {
  if (rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return false;
  }
  return comment.trim().length === 0 || (ratingAllowsComment(rating) && comment.trim().length <= commentMaxLength);
}

export function formatAverageRating(average: number | null, language: string): string | null {
  if (average === null) {
    return null;
  }
  return new Intl.NumberFormat(language.startsWith("en") ? "en-GB" : "bs-BA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(average);
}

export function totalReplacements(replacements: KnowledgeReplyReplacements): number {
  return replacements.email + replacements.person + replacements.ip + replacements.phone;
}

/** Suggested category key from a display name: lowercase ASCII, dashes. */
export function suggestCategoryKey(name: string): string {
  const map: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "dj" };
  return name
    .toLowerCase()
    .replace(/[čćšžđ]/g, (letter) => map[letter] ?? letter)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
