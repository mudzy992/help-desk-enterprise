const listeners = new Set<() => void>();
let generation = 0;

export function bumpSettingsGeneration(): void {
  generation += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function getSettingsGeneration(): number {
  return generation;
}

export function subscribeSettingsGeneration(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears subscribers and state for test isolation. */
export function resetSettingsRealtimeStoreForTests(): void {
  generation = 0;
  listeners.clear();
}
