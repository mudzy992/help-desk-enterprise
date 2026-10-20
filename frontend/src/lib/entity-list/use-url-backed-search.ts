import { useEffect, useState } from "react";

/** Keeps a controlled search input aligned with Back/Forward URL changes. */
export function useUrlBackedSearch(urlValue: string) {
  const [value, setValue] = useState(urlValue);
  useEffect(() => setValue(urlValue), [urlValue]);
  return [value, setValue] as const;
}
