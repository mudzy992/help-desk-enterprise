import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { AuthorizationService } from './authorization.service';
import type { AuthorizationRequirements } from './authorization.types';
import { ShadowAuthorizationService } from './shadow-authorization.service';

export const shadowTestPrincipal: AuthorizationPrincipal = {
  subjectId: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isLocalOnly: false,
};

export function createTestAuthorizationRequirements(
  overrides: Partial<AuthorizationRequirements> = {},
): AuthorizationRequirements {
  return {
    requiredRoles: [],
    requiredPermissions: [],
    organizationalUnitScope: null,
    serviceScope: null,
    requireOrganizationalUnitScope: false,
    requireServiceScope: false,
    ...overrides,
  };
}

export function createTestAuthorizationHarness() {
  const loadBySubjectId = jest.fn();
  const findOrganizationalUnit = jest.fn();
  const findService = jest.fn();
  const userCreate = jest.fn();
  const userUpdate = jest.fn();
  const prisma = {
    organizationalUnit: {
      findUnique: findOrganizationalUnit,
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    service: {
      findUnique: findService,
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      create: userCreate,
      update: userUpdate,
      delete: jest.fn(),
    },
  };
  return {
    loadBySubjectId,
    findOrganizationalUnit,
    findService,
    userCreate,
    userUpdate,
    prisma,
    authorizationService: new AuthorizationService(
      { loadBySubjectId } as never,
      prisma as never,
    ),
    shadowAuthorizationService: new ShadowAuthorizationService(
      { loadBySubjectId } as never,
      prisma as never,
    ),
  };
}
