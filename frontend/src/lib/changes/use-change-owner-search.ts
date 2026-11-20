"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { changeQueryKeys, searchChangeOwners } from "@/services/changes-api";

/**
 * W7.66: the owner picker asks the server for managers of **one** unit, so the
 * query is keyed by the unit as well as the search text. It stays idle until a
 * unit is chosen, and `reset()` clears the text when the form reopens or the
 * unit moves (a manager of the old unit need not manage the new one).
 */
export function useChangeOwnerSearch(input: {
  readonly open: boolean;
  readonly canAssignOwner: boolean;
  readonly organizationalUnitId: string;
  /** Nothing to pick while an owner is already chosen. */
  readonly hasOwner: boolean;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const owners = useQuery({
    queryKey: changeQueryKeys.owners(debounced, input.organizationalUnitId),
    queryFn: () => searchChangeOwners(debounced, input.organizationalUnitId),
    enabled:
      input.open &&
      input.canAssignOwner &&
      !input.hasOwner &&
      input.organizationalUnitId !== "",
    retry: false,
  });

  return {
    search,
    setSearch,
    reset: useCallback(() => setSearch(""), []),
    items: owners.data?.items ?? [],
    loading: owners.isFetching,
  };
}
