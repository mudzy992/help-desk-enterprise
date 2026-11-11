const authservIdLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

/** Normalize a single DNS-style authserv-id. Wildcards, lists and header syntax are rejected. */
export function normalizeAuthservId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (normalized.length === 0 || normalized.length > 253) return null;
  const labels = normalized.split(".");
  return labels.every(
    (label) => label.length <= 63 && authservIdLabel.test(label),
  )
    ? normalized
    : null;
}
