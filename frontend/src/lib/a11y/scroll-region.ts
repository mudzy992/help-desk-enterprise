/**
 * Paket 2.8 (axe `scrollable-region-focusable`, WCAG 2.1.1): a region that
 * scrolls must be reachable from the keyboard. It already is when it contains
 * a focusable element (Tab moves into it and the browser scrolls); otherwise
 * the region itself needs `tabIndex=0`. Pure, so it is unit-tested without a DOM.
 */
export interface ScrollMetrics {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly overflowX: string;
  readonly overflowY: string;
}

const SCROLLING = new Set(["auto", "scroll"]);

export const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), [contenteditable='true']";

/** 1 px tolerance: sub-pixel layout rounding must not flip the state. */
export function isScrollable(metrics: ScrollMetrics): boolean {
  const horizontal = SCROLLING.has(metrics.overflowX) && metrics.scrollWidth > metrics.clientWidth + 1;
  const vertical = SCROLLING.has(metrics.overflowY) && metrics.scrollHeight > metrics.clientHeight + 1;
  return horizontal || vertical;
}

export function needsOwnFocus(scrollable: boolean, containsFocusable: boolean): boolean {
  return scrollable && !containsFocusable;
}
