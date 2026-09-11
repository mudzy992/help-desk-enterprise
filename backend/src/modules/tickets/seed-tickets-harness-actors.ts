import { authorizationRoleKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { ticketsTestIds } from './tickets-test-ids';

export function seedTicketsHarnessActors(
  contexts: Map<string, AuthorizationContext>,
): void {
  contexts.set(
    ticketsTestIds.requester,
    createScopedContext(ticketsTestIds.requester, authorizationRoleKeys.user),
  );
  contexts.set(
    ticketsTestIds.watcher,
    createScopedContext(ticketsTestIds.watcher, authorizationRoleKeys.user),
  );
  contexts.set(
    ticketsTestIds.agentIt,
    createScopedContext(
      ticketsTestIds.agentIt,
      authorizationRoleKeys.agent,
      ticketsTestIds.ouIt,
      '/Korisnici/IT',
    ),
  );
  contexts.set(
    ticketsTestIds.agentHr,
    createScopedContext(
      ticketsTestIds.agentHr,
      authorizationRoleKeys.agent,
      ticketsTestIds.ouHr,
      '/Korisnici/HR',
    ),
  );
  contexts.set(
    ticketsTestIds.superAdmin,
    createTestAuthorizationContext({
      subjectId: ticketsTestIds.superAdmin,
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.superAdmin,
          permissionKeys: [],
        }),
      ],
    }),
  );
}

export function seedItPeerAgent(
  contexts: Map<string, AuthorizationContext>,
): void {
  contexts.set(
    ticketsTestIds.agentItPeer,
    createScopedContext(
      ticketsTestIds.agentItPeer,
      authorizationRoleKeys.agent,
      ticketsTestIds.ouIt,
      '/Korisnici/IT',
    ),
  );
}

function createScopedContext(
  subjectId: string,
  roleKey: string,
  organizationalUnitId?: string,
  organizationalUnitPath?: string,
): AuthorizationContext {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey,
        organizationalUnitId: organizationalUnitId ?? null,
        organizationalUnitPath: organizationalUnitPath ?? null,
        permissionKeys: [],
      }),
    ],
  });
}
