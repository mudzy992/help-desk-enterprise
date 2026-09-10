import {
  allPermissionKeys,
  authorizationRoleKeys,
  defaultRolePermissionKeys,
  permissionKeys,
} from './authorization.constants';

describe('default role permission mapping', () => {
  it('keeps USER without admin permissions', () => {
    expect(defaultRolePermissionKeys[authorizationRoleKeys.user]).toEqual([]);
  });

  it('gives ADMIN every AGENT permission plus catalog and governance writes', () => {
    const agent = defaultRolePermissionKeys[authorizationRoleKeys.agent] ?? [];
    const admin = defaultRolePermissionKeys[authorizationRoleKeys.admin] ?? [];
    expect(admin).toEqual(expect.arrayContaining([...agent]));
    expect(admin).toEqual(
      expect.arrayContaining([
        permissionKeys.routingWrite,
        permissionKeys.serviceCatalogWrite,
        permissionKeys.settingsWrite,
        permissionKeys.auditExport,
      ]),
    );
    expect(admin).not.toContain(permissionKeys.confidentialBreakGlass);
  });

  it('documents SuperAdmin as the full catalog including break-glass', () => {
    expect(defaultRolePermissionKeys[authorizationRoleKeys.superAdmin]).toEqual(
      allPermissionKeys,
    );
    expect(allPermissionKeys).toContain(permissionKeys.confidentialBreakGlass);
  });
});
