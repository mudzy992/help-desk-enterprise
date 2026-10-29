import { useEffect, useState } from "react";

export function useCommercialSearch(value: string, minLength = 2): string {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebounced(value.trim().length >= minLength ? value.trim() : ""),
      300,
    );
    return () => window.clearTimeout(handle);
  }, [value, minLength]);
  return debounced;
}
