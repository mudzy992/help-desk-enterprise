import { useEffect, useState } from "react";
import { localDayKey } from "@/lib/query/query-keys";

export function millisecondsUntilNextLocalDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(next.getTime() - now.getTime(), 1);
}

/** Keeps day-scoped dashboard counters fresh while a tab remains open overnight. */
export function useLocalDayKey(): string {
  const [dayKey, setDayKey] = useState(() => localDayKey());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setDayKey(localDayKey());
          schedule();
        },
        millisecondsUntilNextLocalDay(new Date()) + 25,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return dayKey;
}
