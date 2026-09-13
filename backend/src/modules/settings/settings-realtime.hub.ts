import { Injectable } from '@nestjs/common';
import type { SettingsUpdatedRealtimePayload } from './settings-realtime.types';

type SettingsRealtimeListener = (
  payload: SettingsUpdatedRealtimePayload,
) => void;

@Injectable()
export class SettingsRealtimeHub {
  private readonly listeners = new Set<SettingsRealtimeListener>();

  subscribe(listener: SettingsRealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(payload: SettingsUpdatedRealtimePayload): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}
