import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FOCUSABLE_SELECTOR, isScrollable, needsOwnFocus } from "@/lib/a11y/scroll-region";
import { usePrefersReducedMotion } from "@/lib/install/use-prefers-reduced-motion";
import {
  installStepLabelKey,
  installStepPresentations,
} from "@/lib/install/install-step-presentation";
import type { InstallRailItem } from "@/lib/install/install-rail-state";

/*
  Install wizard v2 — „Aurora“: the rail is a vertical flight timeline.

  Five states come from `GET /install/status` and nothing here decides the flow:
  `done` (answered), `current` (where the operator stands), `deferred` (they said
  „kasnije“), `locked` (the package does not offer it) and `upcoming`.

  Fourteen steps are taller than any screen, so the map gets a *window* instead of
  a wall: the column is capped to the viewport (`.iw-plan`, `install-theme.css`),
  the list scrolls inside it, and the window fades at both ends — but only when
  there is something to fade (`data-scrollable`). Nothing is ever unreachable: the
  active step is followed, the window re-centres on it at every step change, so
  „where am I“ never depends on the operator scrolling. The scroll is written as
  `scrollTop` on the window itself, never `scrollIntoView`, which drags the whole
  page along.

  The connector belongs to the *item* (`::before` / `::after` in
  `install-theme.css`), not to the list. One line behind every node runs under the
  icons, and the nodes are glass — transparent — so it looked like the line had
  been struck through them. Drawn per segment it starts below a node and stops
  before the next one, and „how far are we“ is the colour of the segment leaving a
  step the run has already passed.

  The overflow rules mirror `components/ui/scroll-region.tsx` (Paket 2.8): the
  window takes focus only while it really overflows and holds nothing focusable.
*/

export { resolveInstallRailState, type InstallRailItem, type InstallRailState } from "@/lib/install/install-rail-state";

export function InstallStepRail({ items }: { readonly items: readonly InstallRailItem[] }) {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const windowReference = useRef<HTMLDivElement | null>(null);
  const railReference = useRef<HTMLOListElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [ownsFocus, setOwnsFocus] = useState(false);
  const currentIndex = items.findIndex((item) => item.state === "current");

  /*
    Fokus aktivnog koraka: the window follows the step, not the operator. The
    distance is read with rectangles rather than `offsetTop`, because the window
    carries the fade's own padding and the offsets belong to the list — the two
    are not the same origin, and centring should not depend on which one it is.
  */
  const followActiveStep = useCallback(() => {
    const element = windowReference.current;
    const item = railReference.current?.children[currentIndex] as HTMLElement | undefined;
    if (element === null || item === undefined || typeof element.scrollTo !== "function") return;
    const view = element.getBoundingClientRect();
    const row = item.getBoundingClientRect();
    // Row 0 centres to a negative number, which the clamp turns into the top —
    // so the first step needs no special case.
    const centred =
      element.scrollTop + (row.top - view.top) - (element.clientHeight - row.height) / 2;
    element.scrollTo({
      top: Math.max(0, centred),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [currentIndex, prefersReducedMotion]);

  useEffect(followActiveStep, [followActiveStep]);

  useEffect(() => {
    const element = windowReference.current;
    if (element === null) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      const scrollable = isScrollable({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      });
      setOverflows(scrollable);
      setOwnsFocus(needsOwnFocus(scrollable, element.querySelector(FOCUSABLE_SELECTOR) !== null));
      // A font swap or any re-layout moves the rows; the follow is cheap and
      // keeps the active step where the operator last saw it.
      followActiveStep();
    };
    measure();
    // jsdom has no ResizeObserver; the measurement above already ran.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild !== null) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [items, followActiveStep]);

  return (
    <div
      ref={windowReference}
      className="iw-rail-window focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
      data-scrollable={overflows ? "true" : "false"}
      tabIndex={ownsFocus ? 0 : undefined}
      role={ownsFocus ? "region" : undefined}
      aria-label={ownsFocus ? t("a11y.scrollRegion") : undefined}
    >
      <ol ref={railReference} className="iw-rail">
        {items.map((item) => {
          const Icon = installStepPresentations[item.key].icon;
          const isAhead = item.state === "upcoming" || item.state === "locked";
          return (
            <li key={item.key} className="iw-rail-item" data-state={item.state}>
              <span className="iw-node" data-state={item.state} aria-hidden="true">
                {item.state === "done" ? <Check size={15} strokeWidth={2.7} /> : <Icon size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "iw-rail-label",
                      item.state === "current" && "font-semibold text-foreground",
                      !isAhead && item.state !== "current" && "text-foreground/85",
                      isAhead && "text-muted-foreground",
                      item.state === "deferred" && "text-warning",
                    )}
                  >
                    {t(installStepLabelKey(item.key))}
                  </span>
                  {item.state === "deferred" ? (
                    <span className="iw-badge shrink-0 px-1.5 py-px text-[10px] font-semibold tracking-[0.04em] uppercase">
                      {t("install.step.skipped")}
                    </span>
                  ) : null}
                </span>
                {item.state === "current" ? (
                  <span className="iw-rail-note">{t("install.shell.currentStep")}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
