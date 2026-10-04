/**
 * Faza 3 (c): isti algoritam kao generator ogledala
 * (`scripts/generate-docs-content.mjs`) — dijakritika u ASCII, sve što nije
 * slovo/cifra u `-`, bez vodećih/završnih crtica. Anchori iz `manifest.json`
 * moraju se poklopiti sa `id` atributima u rendereru.
 */
export function slugifyHeading(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, (letter) => (letter === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
