import { useEffect, useState } from "react";
import { subscribeToAnnouncements, type Announcement } from "@/lib/a11y/announcer";

const CLEAR_AFTER_MS = 7_000;

/**
 * The two live regions for the global announcer. Rendered once in the shell.
 * The region is emptied and refilled so that repeating the same text is read again.
 */
export function AnnouncerRegions() {
  const [polite, setPolite] = useState<Announcement | null>(null);
  const [assertive, setAssertive] = useState<Announcement | null>(null);

  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = subscribeToAnnouncements((announcement) => {
      const set = announcement.politeness === "assertive" ? setAssertive : setPolite;
      set(null);
      timers.add(window.setTimeout(() => set(announcement), 50));
      timers.add(
        window.setTimeout(() => {
          set((current) => (current?.id === announcement.id ? null : current));
        }, CLEAR_AFTER_MS),
      );
    });
    return () => {
      unsubscribe();
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return (
    <div className="sr-only">
      <div aria-live="polite" aria-atomic="true" data-testid="a11y-announcer-polite">
        {polite?.message ?? ""}
      </div>
      <div aria-live="assertive" aria-atomic="true" data-testid="a11y-announcer-assertive">
        {assertive?.message ?? ""}
      </div>
    </div>
  );
}
