/**
 * After a failed submit, move focus to the first invalid control (2.8 §3.2,
 * WCAG 3.3.1). Runs after React has rendered the error state.
 */
export function focusFirstInvalid(container: ParentNode | null | undefined = document): boolean {
  const root = container ?? document;
  const target = root.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (target === null) {
    return false;
  }
  target.focus();
  target.scrollIntoView?.({ block: "center" });
  return true;
}

export function focusFirstInvalidSoon(container?: ParentNode | null): void {
  window.requestAnimationFrame(() => {
    focusFirstInvalid(container);
  });
}
