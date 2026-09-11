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
  contexts.set(
    knowledgeBaseTestIds.ownerUser,
    createRoleContext(knowledgeBaseTestIds.ownerUser, authorizationRoleKeys.user),
  );
  contexts.set(
    knowledgeBaseTestIds.reviewerUser,
    createRoleContext(
      knowledgeBaseTestIds.reviewerUser,
      authorizationRoleKeys.user,
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
): AuthorizationContext {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey,
        organizationalUnitId,
        organizationalUnitPath,
        permissionKeys: [...(defaultRolePermissionKeys[roleKey] ?? [])],
      }),
    ],
  });
}
