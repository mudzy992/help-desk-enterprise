import { createHash } from "node:crypto";

/**
 * Stable optimistic-concurrency token for the complete service/form row set.
 * Includes scalar fields and timestamps so a no-op-looking concurrent write is
 * still treated as a new version of the catalog state.
 */
export function computeCatalogStateHash(
  services: readonly unknown[],
  forms: readonly unknown[],
): string {
  const state = {
    services: sortRows(services),
    forms: sortRows(forms),
  };
  return createHash("sha256").update(stableJsonStringify(state)).digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}

function sortRows(rows: readonly unknown[]): readonly unknown[] {
  return [...rows].sort((left, right) => {
    const leftId = readId(left);
    const rightId = readId(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

function readId(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const id = (value as Readonly<Record<string, unknown>>).id;
  return typeof id === "string" ? id : "";
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}
