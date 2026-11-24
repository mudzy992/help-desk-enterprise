import { ForbiddenException } from '@nestjs/common';
import { permissionKeys } from '../authorization/authorization.constants';
import type { ResourcePolicyDecision } from '../authorization/evaluate-resource-policy';
import {
  assertActorManagesUserDestination,
  userManageScopeForbiddenCode,
} from './assert-user-manage-scope';

const principal = {
  subjectId: 'admin-1',
  email: 'admin.a@example.com',
  displayName: 'Admin A',
  isLocalOnly: true,
};

function serviceReturning(decision: ResourcePolicyDecision) {
  const authorizeResource = jest.fn().mockResolvedValue(decision);
  return { authorizeResource };
}

describe('assertActorManagesUserDestination (W2.10)', () => {
  it('asks the canonical resource policy for the destination unit', async () => {
    const service = serviceReturning({ allowed: true, reason: 'OU_ASSIGNMENT_ALLOWED' });
    await assertActorManagesUserDestination({
      authorizationService: service as never,
      principal,
      destination: { organizationalUnitId: 'ou-a', serviceId: null },
    });
    expect(service.authorizeResource).toHaveBeenCalledWith({
      principal,
      permissionKey: permissionKeys.userManage,
      ownerUserId: null,
      organizationalUnitId: 'ou-a',
      serviceId: null,
      allowOwner: false,
    });
  });

  it('rejects a destination outside the caller scope without naming it', async () => {
    const service = serviceReturning({ allowed: false, reason: 'NO_MATCHING_PERMISSION_SCOPE' });
    await expect(
      assertActorManagesUserDestination({
        authorizationService: service as never,
        principal,
        destination: { organizationalUnitId: 'ou-b', serviceId: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      assertActorManagesUserDestination({
        authorizationService: service as never,
        principal,
        destination: { organizationalUnitId: 'ou-b', serviceId: null },
      }),
    ).rejects.toMatchObject({ response: { code: userManageScopeForbiddenCode } });
  });

  it('treats a blank destination as "no unit", which only a global grant covers', async () => {
    const service = serviceReturning({ allowed: false, reason: 'NO_MATCHING_PERMISSION_SCOPE' });
    await expect(
      assertActorManagesUserDestination({
        authorizationService: service as never,
        principal,
        destination: { organizationalUnitId: '   ', serviceId: '  ' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.authorizeResource).toHaveBeenCalledWith(
      expect.objectContaining({ organizationalUnitId: null, serviceId: null }),
    );
  });

  it('checks a service-scoped grant destination through the same policy', async () => {
    const service = serviceReturning({ allowed: true, reason: 'SERVICE_ASSIGNMENT_ALLOWED' });
    await assertActorManagesUserDestination({
      authorizationService: service as never,
      principal,
      destination: { organizationalUnitId: null, serviceId: 'svc-1' },
    });
    expect(service.authorizeResource).toHaveBeenCalledWith(
      expect.objectContaining({ organizationalUnitId: null, serviceId: 'svc-1' }),
    );
  });

  it('fails closed when there is no principal at all', async () => {
    const service = serviceReturning({ allowed: false, reason: 'MISSING_CONTEXT' });
    await expect(
      assertActorManagesUserDestination({
        authorizationService: service as never,
        principal: null,
        destination: { organizationalUnitId: 'ou-a', serviceId: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts an explicit permission override for other control planes', async () => {
    const service = serviceReturning({ allowed: true, reason: 'GLOBAL_ASSIGNMENT_ALLOWED' });
    await assertActorManagesUserDestination({
      authorizationService: service as never,
      principal,
      permissionKey: permissionKeys.userSecurityManage,
      destination: { organizationalUnitId: 'ou-a', serviceId: null },
    });
    expect(service.authorizeResource).toHaveBeenCalledWith(
      expect.objectContaining({ permissionKey: permissionKeys.userSecurityManage }),
    );
  });
});
