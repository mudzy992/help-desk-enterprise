import { Injectable } from '@nestjs/common';
import type {
  WebsocketAdapterHealthReason,
  WebsocketAdapterHealthState,
} from './websocket-adapter-health.types';

/**
 * Process-local effective state for the Socket.IO Redis adapter. Readiness is
 * deliberately fail-closed until the live adapter clients pass their Pub/Sub
 * probe; an in-memory adapter is not an equivalent multi-instance fallback.
 */
@Injectable()
export class WebsocketAdapterHealthService {
  private state: WebsocketAdapterHealthState = 'starting';
  private reason: WebsocketAdapterHealthReason = 'startup';

  setState(
    state: WebsocketAdapterHealthState,
    reason: WebsocketAdapterHealthReason,
  ): boolean {
    const changed = this.state !== state;
    this.state = state;
    this.reason = reason;
    return changed;
  }

  isReady(): boolean {
    return this.state === 'healthy';
  }

  getSnapshot(): {
    readonly state: WebsocketAdapterHealthState;
    readonly reason: WebsocketAdapterHealthReason;
  } {
    return { state: this.state, reason: this.reason };
  }
}
