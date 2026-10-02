/**
 * Tab titles (2.8 §3.1, WCAG 2.4.2).
 *
 * The product name starts as the static <title> in index.html (text before
 * " — ") and is replaced by the client's configured name once branding loads
 * (Paket 4.1); the current tab title is rewritten in place.
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

export function setProductName(name: string): void {
  const next = name.trim();
  if (next.length === 0) return;
  const previous = getProductName();
  productName = next;
  if (typeof document === "undefined" || previous === next) return;
  const suffix = `${SEPARATOR}${previous}`;
  if (document.title === previous || document.title.startsWith(`${previous} — `)) document.title = next;
  else if (document.title.endsWith(suffix)) document.title = `${document.title.slice(0, -suffix.length)}${SEPARATOR}${next}`;
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
