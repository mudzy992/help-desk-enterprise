import { useEffect, useRef, type RefObject } from "react";

/**
 * Paket 5.3.0 (D3): one rule for every hand-rolled floating panel (popover,
 * dropdown, picker) that is not a Radix primitive.
 *
 * - A pointer press outside the panel AND outside its trigger closes it. The
 *   trigger is excluded so its own toggle `onClick` does not race the close.
 * - Escape closes it (unless something inside already handled the key).
 * - On close, focus returns to the trigger if it was inside the panel, so a
 *   keyboard user is never dropped at `<body>` (WCAG 2.4.3).
 * - Presses inside a Radix portal (menus/dialogs opened from the panel) are
 *   not "outside": they belong to the panel's own interaction.
 */
export interface DismissableOptions {
  readonly isOpen: boolean;
  readonly onDismiss: () => void;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly triggerRef?: RefObject<HTMLElement | null>;
  /** Defaults to true. Set false when the caller restores focus itself. */
  readonly restoreFocus?: boolean;
  /** Defaults to true. Set false when the panel owns Escape itself. */
  readonly closeOnEscape?: boolean;
}

type ContainsTarget = { contains(node: Node | null): boolean } | null | undefined;

/** Pure decision used by the hook — unit tested without a DOM. */
export function isOutsidePress(
  target: Node | null,
  containers: readonly ContainsTarget[],
  isInsidePortal: boolean,
): boolean {
  if (target === null || isInsidePortal) return false;
  return containers.every((container) => container === null || container === undefined || !container.contains(target));
}

const PORTAL_SELECTOR = "[data-radix-popper-content-wrapper], [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";

/**
 * True when the press landed in a layered surface (menu, dialog, listbox)
 * that does NOT host the panel — i.e. something opened on top of it. When the
 * panel itself lives inside a dialog, a press elsewhere in that dialog is a
 * normal outside press.
 */
function isInsideForeignLayer(target: EventTarget | null, panel: HTMLElement | null): boolean {
  if (!(target instanceof Element)) return false;
  const layer = target.closest(PORTAL_SELECTOR);
  return layer !== null && (panel === null || !layer.contains(panel));
}

export function useDismissable({
  isOpen,
  onDismiss,
  panelRef,
  triggerRef,
  restoreFocus = true,
  closeOnEscape = true,
}: DismissableOptions): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!isOpen) return undefined;

    const close = () => {
      const panel = panelRef.current;
      const hadFocusInside = panel !== null && panel.contains(document.activeElement);
      dismissRef.current();
      if (restoreFocus && hadFocusInside) triggerRef?.current?.focus();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const panel = panelRef.current;
      const insideLayer = isInsideForeignLayer(event.target, panel);
      if (isOutsidePress(target, [panel, triggerRef?.current], insideLayer)) {
        dismissRef.current();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, panelRef, triggerRef, restoreFocus, closeOnEscape]);
}
