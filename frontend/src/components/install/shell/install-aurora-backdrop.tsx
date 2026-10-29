/*
  Install wizard v2 — „Aurora“: the canvas behind everything.

  Three drifting radial gradients, a 48 px plan grid and a vignette. It is one
  `aria-hidden` element with no content and no state — `.iw-backdrop` in
  `install-theme.css` owns the whole picture, and `prefers-reduced-motion`
  freezes the drift (`install-scenes.css`).
*/

export function InstallAuroraBackdrop() {
  return <div className="iw-backdrop" aria-hidden="true" data-iw-backdrop="" />;
}
