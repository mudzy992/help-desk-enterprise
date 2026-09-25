import { Injectable } from '@nestjs/common';
import type { AdminConfigUpdatedPayload } from './admin-config-realtime.types';

type Listener = (payload: AdminConfigUpdatedPayload) => void;

/** Package 1.7 (R2): in-process fan-out to the websocket gateway. */
@Injectable()
export class AdminConfigRealtimeHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(payload: AdminConfigUpdatedPayload): void {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // A broken listener must never fail the admin's mutation.
      }
    }
  }
}
