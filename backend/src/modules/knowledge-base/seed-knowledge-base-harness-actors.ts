import {
  authorizationRoleKeys,
  defaultRolePermissionKeys,
} from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { knowledgeBaseTestIds } from './knowledge-base-test-ids';

export function seedKnowledgeBaseHarnessActors(
  contexts: Map<string, AuthorizationContext>,
): void {
  contexts.set(
    knowledgeBaseTestIds.requester,
    createRoleContext(knowledgeBaseTestIds.requester, authorizationRoleKeys.user),
  );
  // W7.49 (BA-knowledge-base-01): the owner is an ordinary USER whose
  // assignment covers the IT OU but grants no knowledge permission — the
  // delegation, not a permission, is what lets this actor write.
  contexts.set(
    knowledgeBaseTestIds.ownerUser,
    createScopedContext(
      knowledgeBaseTestIds.ownerUser,
      authorizationRoleKeys.user,
      knowledgeBaseTestIds.ouIt,
      '/Korisnici/IT',
      [],
    ),
  );
  // W7.50: same for the reviewer — a scoped USER with no knowledge permission,
  // so the review delegation is what the tests prove.
  contexts.set(
    knowledgeBaseTestIds.reviewerUser,
    createScopedContext(
      knowledgeBaseTestIds.reviewerUser,
      authorizationRoleKeys.user,
      knowledgeBaseTestIds.ouIt,
      '/Korisnici/IT',
      [],
    ),
  );
  contexts.set(
    knowledgeBaseTestIds.agentIt,
    createScopedContext(
      knowledgeBaseTestIds.agentIt,
      authorizationRoleKeys.agent,
      knowledgeBaseTestIds.ouIt,
      '/Korisnici/IT',
    ),
  );
  contexts.set(
    knowledgeBaseTestIds.agentHr,
    createScopedContext(
      knowledgeBaseTestIds.agentHr,
      authorizationRoleKeys.agent,
      knowledgeBaseTestIds.ouHr,
      '/Korisnici/HR',
    ),
  );
  contexts.set(
    knowledgeBaseTestIds.adminIt,
    createScopedContext(
      knowledgeBaseTestIds.adminIt,
      authorizationRoleKeys.admin,
      knowledgeBaseTestIds.ouIt,
      '/Korisnici/IT',
    ),
  );
  contexts.set(
    knowledgeBaseTestIds.superAdmin,
    createTestAuthorizationContext({
      subjectId: knowledgeBaseTestIds.superAdmin,
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

function createRoleContext(
  subjectId: string,
  roleKey: string,
): AuthorizationContext {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey,
        permissionKeys: [],
        organizationalUnitId: null,
        organizationalUnitPath: null,
      }),
    ],
  });
}

function createScopedContext(
  subjectId: string,
  roleKey: string,
  organizationalUnitId: string,
  organizationalUnitPath: string,
  permissionKeys?: readonly string[],
): AuthorizationContext {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey,
        organizationalUnitId,
        organizationalUnitPath,
        permissionKeys: [
          ...(permissionKeys ?? defaultRolePermissionKeys[roleKey] ?? []),
        ],
      }),
    ],
  });
}
