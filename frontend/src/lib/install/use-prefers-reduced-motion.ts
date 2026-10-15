import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/*
  Install wizard v2 (F3): every animation in the shell is decoration, so the
  operator's system setting decides whether it runs at all. The CSS block in
  `index.css` already disables the keyframes; this hook is what component code
  needs when it has to choose between „animated“ and „static“ markup (the final
  check mark, for example). `matchMedia` is absent in some test environments, so
  the absence of the API means „no preference“.
*/

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setIsReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isReduced;
}
