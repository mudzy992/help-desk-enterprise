/**
 * Tab titles (2.8 §3.1, WCAG 2.4.2).
 *
 * The product name is read once from the static <title> in index.html (text
 * before " — "), so it stays configurable at build time and is never
 * duplicated in code.
 */
const SEPARATOR = " · ";

let productName: string | null = null;

export function resolveProductName(initialTitle: string): string {
  const [name] = initialTitle.split(" — ");
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : initialTitle.trim();
}

export function getProductName(): string {
  if (productName === null) {
    productName = resolveProductName(typeof document === "undefined" ? "" : document.title);
  }
  return productName;
}

export function formatDocumentTitle(parts: readonly (string | null | undefined)[], product: string): string {
  const clean = parts
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0 && part !== product);
  return [...clean, product].join(SEPARATOR);
}

export function setDocumentTitle(...parts: (string | null | undefined)[]): void {
  document.title = formatDocumentTitle(parts, getProductName());
}
