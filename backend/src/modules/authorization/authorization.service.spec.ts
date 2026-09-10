import { permissionKeys } from './authorization.constants';
import { AuthorizationService } from './authorization.service';
import { createTestAuthorizationContext } from './create-test-authorization-context';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const principal = {
  subjectId: 'user-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  isLocalOnly: false,
};

describe('AuthorizationService', () => {
  const loadBySubjectId = jest.fn();
  const findOrganizationalUnit = jest.fn();
  const findService = jest.fn();
  const service = new AuthorizationService(
    { loadBySubjectId } as never,
    {
      organizationalUnit: { findUnique: findOrganizationalUnit },
      service: { findUnique: findService },
    } as never,
  );

  beforeEach(() => {
    loadBySubjectId.mockReset();
    findOrganizationalUnit.mockReset();
    findService.mockReset();
    loadBySubjectId.mockResolvedValue(createTestAuthorizationContext());
    findOrganizationalUnit.mockResolvedValue({ ouPath: '/Korisnici/ED Zenica' });
    findService.mockResolvedValue({ id: 'service-hr' });
  });

  it('fails closed without a principal or authorization context', async () => {
    await expect(
      service.authorize({
        principal: null,
        requirements: {
          requiredRoles: [],
          requiredPermissions: [permissionKeys.ticketMerge],
          organizationalUnitScope: null,
          serviceScope: null,
          requireOrganizationalUnitScope: false,
          requireServiceScope: false,
        },
        organizationalUnitId: null,
        serviceId: null,
      }),
    ).resolves.toBe(false);
    loadBySubjectId.mockResolvedValue(null);
    await expect(
      service.authorize({
        principal,
        requirements: {
          requiredRoles: [],
          requiredPermissions: [permissionKeys.ticketMerge],
          organizationalUnitScope: null,
          serviceScope: null,
          requireOrganizationalUnitScope: false,
          requireServiceScope: false,
        },
        organizationalUnitId: null,
        serviceId: null,
      }),
    ).resolves.toBe(false);
  });

  it('fails closed when the requested OU or service cannot be resolved', async () => {
    findOrganizationalUnit.mockResolvedValue(null);
    await expect(
      service.authorize({
        principal,
        requirements: {
          requiredRoles: [],
          requiredPermissions: [permissionKeys.routingWrite],
          organizationalUnitScope: { field: 'organizationalUnitId' },
          serviceScope: null,
          requireOrganizationalUnitScope: true,
          requireServiceScope: false,
        },
        organizationalUnitId: 'missing-ou',
        serviceId: null,
      }),
    ).resolves.toBe(false);
    findOrganizationalUnit.mockResolvedValue({ ouPath: '/Korisnici/ED Zenica' });
    findService.mockResolvedValue(null);
    await expect(
      service.authorize({
        principal,
        requirements: {
          requiredRoles: [],
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          organizationalUnitScope: null,
          serviceScope: { field: 'serviceId' },
          requireOrganizationalUnitScope: false,
          requireServiceScope: true,
        },
        organizationalUnitId: null,
        serviceId: 'missing-service',
      }),
    ).resolves.toBe(false);
  });

  it('loads only service identity, not service implementation fields', async () => {
    loadBySubjectId.mockResolvedValue(
      createTestAuthorizationContext({
        isLocalOnly: true,
        isSuperAdmin: true,
        assignments: [],
      }),
    );
    await expect(
      service.authorize({
        principal: { ...principal, isLocalOnly: true },
        requirements: {
          requiredRoles: [],
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          organizationalUnitScope: { field: 'organizationalUnitId' },
          serviceScope: { field: 'serviceId' },
          requireOrganizationalUnitScope: true,
          requireServiceScope: true,
        },
        organizationalUnitId: 'ou-zenica',
        serviceId: 'service-hr',
      }),
    ).resolves.toBe(true);
    expect(findService).toHaveBeenCalledWith({
      where: { id: 'service-hr' },
      select: { id: true },
    });
    expect(findOrganizationalUnit).toHaveBeenCalledWith({
      where: { id: 'ou-zenica' },
      select: { ouPath: true },
    });
  });
});
