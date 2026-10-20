import type { QueryClient, QueryKey } from "@tanstack/react-query";

export function invalidateEntityQueries(queryClient: QueryClient, queryKeys: readonly QueryKey[]) {
  return Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Precise mutation invalidation matrix. Prefixes intentionally exclude capabilities/options. */
export const entityMutationQueryKeys = {
  assets: {
    records: [
      ["assets", "list"],
      ["assets", "mine"],
      ["assets", "overview"],
    ] as readonly QueryKey[],
    catalog: [
      ["assets", "catalog"],
      ["assets", "options"],
      ["assets", "list"],
    ] as readonly QueryKey[],
    contracts: [
      ["assets", "contracts"],
      ["assets", "contract"],
    ] as readonly QueryKey[],
    licenses: [
      ["assets", "licenses"],
      ["assets", "license"],
    ] as readonly QueryKey[],
    transfers: [
      ["assets", "transfers", "list"],
      ["assets", "transfers", "asset"],
      ["assets", "transfers", "mine"],
    ] as readonly QueryKey[],
  },
  problems: {
    record: (id: string): readonly QueryKey[] => [
      ["problems", "detail", id],
      ["problems", "detail", id, "events"],
      ["problems", "list"],
    ],
  },
  changes: {
    record: (id: string): readonly QueryKey[] => [
      ["changes", "detail", id],
      ["changes", "detail", id, "events"],
      ["changes", "list"],
    ],
    templates: [["changes", "templates"]] as readonly QueryKey[],
  },
} as const;
