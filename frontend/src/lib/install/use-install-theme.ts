import { useEffect } from "react";

/*
  Install wizard v2 — „Aurora“ (owner decision, 2026-10-16): the wizard is its
  own visual story and does not follow `data-theme`/`data-accent`.

  The attribute lives on `<html>` rather than on the wizard's own element on
  purpose: Radix portals (the package sheet, the credentials dialog, toasts)
  render into `document.body`, so a wrapper class would leave them behind. The
  previous value is restored on unmount, which is what keeps `/login` — the very
  next screen after „Sistem je spreman“ — on the product's own theme.
*/

export const installThemeAttribute = "data-install-theme";
export const installThemeName = "aurora";

export function useInstallTheme(isEnabled = true): void {
  useEffect(() => {
    if (!isEnabled || typeof document === "undefined") return;
    const root = document.documentElement;
    const previous = root.getAttribute(installThemeAttribute);
    root.setAttribute(installThemeAttribute, installThemeName);
    return () => {
      if (previous === null) root.removeAttribute(installThemeAttribute);
      else root.setAttribute(installThemeAttribute, previous);
    };
  }, [isEnabled]);
}
