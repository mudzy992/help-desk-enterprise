import { useEffect, useState } from "react";

/**
 * Paket 5.3.4 (D5): a detail surface is a centred modal on desktop and a bottom
 * sheet on a phone. The breakpoint matches the shell (`md`): below it the
 * topbar collapses and the sidebar becomes a drawer, so a modal would cover the
 * whole screen anyway.
 */
const compactViewportQuery = "(max-width: 767px)";

function readCompact(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(compactViewportQuery).matches;
}

export function useIsCompactViewport(): boolean {
  const [isCompact, setIsCompact] = useState(readCompact);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(compactViewportQuery);
    const sync = () => setIsCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isCompact;
}
