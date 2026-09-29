import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { announce } from "@/lib/a11y/announcer";
import { setDocumentTitle } from "@/lib/a11y/document-title";

const MAIN_ID = "main-content";
const HEADING_WAIT_MS = 3_000;

function findHeading(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${MAIN_ID} h1`);
}

function headingText(heading: HTMLElement | null): string {
  return heading?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * Route change handling (2.8 §3.1, WCAG 2.4.2/2.4.3/4.1.3):
 * - the tab title follows the page h1 (and updates when it changes, e.g. a
 *   ticket title loaded after the skeleton);
 * - after a pathname change focus moves to the h1 and the page name is
 *   announced. Query-only changes (filters, tabs) keep focus where it is.
 */
export function RouteFocusManager() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    const shouldMoveFocus = !isFirstRender.current;
    isFirstRender.current = false;
    let focused = false;
    let lastTitle = "";

    const sync = () => {
      const heading = findHeading();
      const text = headingText(heading);
      if (text !== lastTitle) {
        lastTitle = text;
        setDocumentTitle(text);
      }
      if (shouldMoveFocus && !focused && heading !== null && text.length > 0) {
        focused = true;
        const active = document.activeElement;
        const userMovedFocus =
          active instanceof HTMLElement &&
          active !== document.body &&
          document.getElementById(MAIN_ID)?.contains(active) === true;
        if (!userMovedFocus) {
          if (!heading.hasAttribute("tabindex")) {
            heading.setAttribute("tabindex", "-1");
          }
          heading.focus({ preventScroll: true });
        }
        announce(text, { dedupeKey: `route:${pathname}`, throttleMs: 500 });
      }
    };

    const main = document.getElementById(MAIN_ID);
    const observer = new MutationObserver(sync);
    if (main !== null) {
      observer.observe(main, { childList: true, subtree: true, characterData: true });
    }
    const stopFocusWait = window.setTimeout(() => {
      focused = true;
    }, HEADING_WAIT_MS);
    sync();
    return () => {
      observer.disconnect();
      window.clearTimeout(stopFocusWait);
    };
  }, [pathname]);

  return null;
}

export const mainContentId = MAIN_ID;
