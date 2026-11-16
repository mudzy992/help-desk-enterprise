import { Injectable } from '@nestjs/common';

/** Internal only. The OU identifies the committed scope, never a browser payload. */
export type GroupScopeChange = { readonly organizationalUnitId: string };
type Listener = (change: GroupScopeChange) => void;

@Injectable()
export class GroupScopeRealtimeHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  publish(change: GroupScopeChange): void {
    for (const listener of this.listeners) {
      try { listener(change); } catch { /* committed mutation must not fail */ }
    }
  }
}
