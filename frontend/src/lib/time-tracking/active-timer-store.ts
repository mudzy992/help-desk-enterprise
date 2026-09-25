import { useSyncExternalStore } from "react";
import {
  getActiveTimer,
  type ActiveTimer,
  type TimeTrackingPolicy,
} from "@/services/tickets-collaboration-api";

/**
 * Package 1.3 (T10): the signed-in agent's running timer, shared by the header
 * indicator, the ticket time panel and the idle host. `generation` increases
 * on every change so screens know when to re-read their time entries.
 */
export type ActiveTimerState = {
  readonly timer: ActiveTimer | null;
  readonly policy: TimeTrackingPolicy | null;
  readonly generation: number;
  /** Ticket paused by the idle guard, resumed on return when autoResume is on. */
  readonly pausedTicket: { readonly ticketId: string; readonly ticketNumber: string } | null;
};

let state: ActiveTimerState = { timer: null, policy: null, generation: 0, pausedTicket: null };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function emit(next: ActiveTimerState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function readActiveTimerState(): ActiveTimerState {
  return state;
}

export function subscribeActiveTimer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveTimer(): ActiveTimerState {
  return useSyncExternalStore(subscribeActiveTimer, readActiveTimerState, readActiveTimerState);
}

/** Re-reads the timer from the server; concurrent calls share one request. */
export function refreshActiveTimer(): Promise<void> {
  if (inFlight !== null) {
    return inFlight;
  }
  inFlight = getActiveTimer()
    .then((response) => {
      const changed = response.timer?.timeLogId !== state.timer?.timeLogId;
      emit({
        ...state,
        timer: response.timer,
        policy: response.policy,
        generation: changed ? state.generation + 1 : state.generation,
      });
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** A local mutation (start/stop/switch) happened; re-read and bump generation. */
export async function markActiveTimerChanged(): Promise<void> {
  emit({ ...state, generation: state.generation + 1 });
  await refreshActiveTimer();
}

export function setPausedTicket(pausedTicket: ActiveTimerState["pausedTicket"]): void {
  emit({ ...state, pausedTicket });
}

export function resetActiveTimer(): void {
  emit({ timer: null, policy: null, generation: 0, pausedTicket: null });
}
