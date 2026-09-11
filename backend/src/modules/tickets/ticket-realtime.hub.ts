import { Injectable } from '@nestjs/common';
import type { TicketRealtimeMessagePayload } from './collaboration.types';

type TicketRealtimeListener = (payload: TicketRealtimeMessagePayload) => void;

@Injectable()
export class TicketRealtimeHub {
  private readonly listeners = new Set<TicketRealtimeListener>();

  subscribe(listener: TicketRealtimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(payload: TicketRealtimeMessagePayload): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}
