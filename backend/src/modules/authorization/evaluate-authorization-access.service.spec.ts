import { permissionKeys } from './authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
  createTestDecisionInput,
} from './create-test-authorization-context';
import { evaluateAuthorizationAccess } from './evaluate-authorization-access';

describe('evaluateAuthorizationAccess service scope', () => {
  it('grants a service-scoped permission only for that service', () => {
    const context = createTestAuthorizationContext({
      assignments: [
        createTestAssignment({
          permissionKeys: [permissionKeys.serviceFormsWrite],
          serviceId: 'service-hr',
        }),
      ],
    });
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context,
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          serviceId: 'service-hr',
          requireServiceScope: true,
        }),
      ),
    ).toBe(true);
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context,
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          serviceId: 'service-it',
          requireServiceScope: true,
        }),
      ),
    ).toBe(false);
  });

  it('lets a service-unscoped assignment cover every requested service', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                permissionKeys: [permissionKeys.serviceFormsWrite],
                serviceId: null,
              }),
            ],
          }),
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          serviceId: 'service-hr',
          requireServiceScope: true,
        }),
      ),
    ).toBe(true);
  });

  it('does not let a service-scoped assignment satisfy an unscoped permission check', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                permissionKeys: [permissionKeys.serviceFormsWrite],
                serviceId: 'service-hr',
              }),
            ],
          }),
          requiredPermissions: [permissionKeys.serviceFormsWrite],
        }),
      ),
    ).toBe(false);
  });

  it('requires permission and service on the same assignment as the OU', () => {
    expect(
      evaluateAuthorizationAccess(
        createTestDecisionInput({
          context: createTestAuthorizationContext({
            assignments: [
              createTestAssignment({
                permissionKeys: [permissionKeys.serviceFormsWrite],
                organizationalUnitId: 'ou-zenica',
                organizationalUnitPath: '/Korisnici/ED Zenica',
                serviceId: 'service-hr',
              }),
              createTestAssignment({
                permissionKeys: [permissionKeys.serviceCatalogWrite],
                organizationalUnitId: 'ou-zenica',
                organizationalUnitPath: '/Korisnici/ED Zenica',
                serviceId: 'service-it',
              }),
            ],
          }),
          requiredPermissions: [permissionKeys.serviceFormsWrite],
          organizationalUnitId: 'ou-zenica',
          organizationalUnitPath: '/Korisnici/ED Zenica',
          serviceId: 'service-it',
          requireOrganizationalUnitScope: true,
          requireServiceScope: true,
        }),
      ),
    ).toBe(false);
  });
});
