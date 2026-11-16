import type { Socket } from 'socket.io';
import { adminRealtimeEventNames, adminRealtimeRoomName } from '../../common/admin-realtime/admin-config-realtime.types';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { decideAuthorizationAccess } from '../authorization/evaluate-authorization-access';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { getSocketPrincipal } from './authenticated-socket';
import { isSocketPrincipal } from './is-socket-principal';
import type { SocketPrincipal } from './socket-authentication.types';

export type ScopedGroupDeliveryDependencies = {
  readonly loadUnit: (id: string) => Promise<{ readonly id: string; readonly ouPath: string } | null>;
  readonly isSessionCurrent: (principal: SocketPrincipal) => Promise<boolean>;
  readonly loadContext: (id: string) => Promise<AuthorizationContext | null>;
  readonly onError?: () => void;
  readonly isActive?: () => boolean;
};

/** Per-socket delivery avoids trusting user rooms that may include a revoked session. */
export async function deliverScopedGroupConfig(
  sockets: Iterable<Socket>,
  organizationalUnitId: string,
  deps: ScopedGroupDeliveryDependencies,
): Promise<void> {
  if (!organizationalUnitId.trim()) return;
  let unit: Awaited<ReturnType<ScopedGroupDeliveryDependencies['loadUnit']>>;
  try { unit = await deps.loadUnit(organizationalUnitId); } catch { deps.onError?.(); return; }
  if (!unit || unit.id !== organizationalUnitId || !unit.ouPath.trim()) return;
  let failed = false;
  const entries = Array.from(sockets);
  for (let i = 0; i < entries.length; i += 20) {
    await Promise.all(entries.slice(i, i + 20).map(async (socket) => {
      const principal = getSocketPrincipal(socket);
      if (deps.isActive?.() === false || !socket.connected || socket.rooms.has(adminRealtimeRoomName) || !isSocketPrincipal(principal)) return;
      try {
        if (!await deps.isSessionCurrent(principal)) return;
        const context = await deps.loadContext(principal.subjectId);
        if (context?.subjectId !== principal.subjectId) return;
        const allowed = decideAuthorizationAccess({
          context, requiredRoles: [authorizationRoleKeys.admin], requiredPermissions: [permissionKeys.groupManage],
          organizationalUnitId: unit.id, organizationalUnitPath: unit.ouPath, serviceId: null,
          requireOrganizationalUnitScope: true, requireServiceScope: false,
        }).allowed;
        if (allowed && deps.isActive?.() !== false && socket.connected && getSocketPrincipal(socket) === principal) {
          socket.emit(adminRealtimeEventNames.configUpdated, { domain: 'groups' });
        }
      } catch {
        failed = true; // No signal when a session or authorization check fails.
      }
    }));
  }
  if (failed) deps.onError?.();
}
