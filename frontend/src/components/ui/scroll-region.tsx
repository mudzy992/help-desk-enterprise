import type { HTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FOCUSABLE_SELECTOR, isScrollable, needsOwnFocus } from "@/lib/a11y/scroll-region";
import { cn } from "@/lib/utils";

interface ScrollRegionProperties extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name announced when the region itself takes focus. */
  readonly label?: string;
}

/**
 * Paket 2.8: wrapper for content that may scroll (wide tables). It becomes a
 * named, focusable region only while it actually overflows and holds nothing
 * focusable, so keyboard users can scroll it and no extra tab stop is added
 * otherwise.
 */
export function ScrollRegion({ label, className, children, ...rest }: ScrollRegionProperties) {
  const { t } = useTranslation();
  const reference = useRef<HTMLDivElement>(null);
  const [focusable, setFocusable] = useState(false);

  useEffect(() => {
    const element = reference.current;
    if (element === null) return;
    const update = () => {
      const style = window.getComputedStyle(element);
      const scrollable = isScrollable({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      });
      setFocusable(needsOwnFocus(scrollable, element.querySelector(FOCUSABLE_SELECTOR) !== null));
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(element);
    if (element.firstElementChild) resize.observe(element.firstElementChild);
    const mutation = new MutationObserver(update);
    mutation.observe(element, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  return (
    <div
      {...rest}
      ref={reference}
      tabIndex={focusable ? 0 : undefined}
      role={focusable ? "region" : rest.role}
      aria-label={focusable ? (label ?? t("a11y.scrollRegion")) : rest["aria-label"]}
      className={cn(className, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70")}
    >
      {children}
    </div>
  );
}
