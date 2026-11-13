import type { Dispatch, SetStateAction } from "react";

/** An async action may finish after the ticket, user or access generation changes. */
export function scopedTicketSetter<T>(
  setter: Dispatch<SetStateAction<T>>,
  isCurrent: () => boolean,
): Dispatch<SetStateAction<T>> {
  return (value) => {
    if (!isCurrent()) return;
    setter((current) => {
      if (!isCurrent()) return current;
      return typeof value === "function" ? (value as (previous: T) => T)(current) : value;
    });
  };
}
