import type { Server } from 'socket.io';
import type { GroupScopeRealtimeHub } from '../../common/admin-realtime/group-scope-realtime.hub';
import { deliverScopedGroupConfig, type ScopedGroupDeliveryDependencies } from './scoped-group-config-delivery';

const internalEvent = 'scoped-group-config-v1';
const maximumPendingUnits = 100;

/** Each instance authorizes its own sockets. The adapter carries only internal scope metadata. */
export function startScopedGroupConfigDispatcher(
  server: Server,
  hub: GroupScopeRealtimeHub,
  deps: ScopedGroupDeliveryDependencies,
  warn: (message: string) => void,
): () => void {
  const pending = new Set<string>();
  let running = false;
  let stopped = false;
  const enqueue = (id: unknown) => {
    if (stopped || typeof id !== 'string' || !id.trim() || id.length > 256) return;
    if (!pending.has(id) && pending.size >= maximumPendingUnits) {
      warn('scoped_group_config_queue_full');
      return;
    }
    pending.add(id);
    if (running) return;
    running = true;
    void (async () => {
      try {
        while (!stopped && pending.size > 0) {
          const next = pending.values().next().value as string;
          pending.delete(next);
          await deliverScopedGroupConfig(server.sockets.sockets.values(), next, {
            ...deps,
            isActive: () => !stopped,
            onError: () => warn('scoped_group_config_authorization_failed'),
          });
        }
      } catch {
        warn('scoped_group_config_dispatch_failed');
      } finally {
        running = false;
      }
    })();
  };
  const unsubscribe = hub.subscribe(({ organizationalUnitId }) => {
    enqueue(organizationalUnitId);
    try { server.serverSideEmit(internalEvent, organizationalUnitId); } catch {
      warn('scoped_group_config_adapter_emit_failed');
    }
  });
  server.on(internalEvent, enqueue);
  return () => {
    stopped = true;
    pending.clear();
    unsubscribe();
    server.off(internalEvent, enqueue);
  };
}
