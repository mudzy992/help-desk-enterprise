import type { ConfigSnapshot } from "./config-versioning.types";

type CurrentCatalogSnapshot = Pick<
  ConfigSnapshot,
  "catalog" | "forms" | "catalogStateHash"
>;

export function buildRollbackSnapshot(
  previous: ConfigSnapshot,
  previousVersion: number,
  capturedAt: string,
  current?: CurrentCatalogSnapshot,
): ConfigSnapshot {
  return {
    ...previous,
    capturedAt,
    rollbackOfVersion: previousVersion,
    ...(current === undefined
      ? {}
      : {
          catalogStateHash: current.catalogStateHash,
          catalog: {
            services: mergePreservingCurrentRows(
              previous.catalog.services,
              current.catalog.services,
            ),
          },
          forms: {
            versions: mergePreservingCurrentRows(
              previous.forms.versions,
              current.forms.versions,
            ),
          },
        }),
  };
}

function mergePreservingCurrentRows<T extends { readonly id: string }>(
  historical: readonly T[],
  current: readonly T[],
): readonly T[] {
  const existingIds = new Set(historical.map((row) => row.id));
  return [...historical, ...current.filter((row) => !existingIds.has(row.id))];
}
