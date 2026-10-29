import { useCallback, useEffect, useRef } from "react";

/** Schedules editor focus and cancels pending DOM work if the composer unmounts. */
export function useTicketComposerFocus() {
  const pendingFrames = useRef(new Set<number>());

  const schedule = useCallback((callback: () => void) => {
    const frame = window.requestAnimationFrame(() => {
      pendingFrames.current.delete(frame);
      callback();
    });
    pendingFrames.current.add(frame);
  }, []);

  useEffect(
    () => () => {
      for (const frame of pendingFrames.current) window.cancelAnimationFrame(frame);
      pendingFrames.current.clear();
    },
    [],
  );

  return schedule;
}
