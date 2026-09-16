import {
  allPermissionKeys,
  authorizationRoleKeys,
  defaultRolePermissionKeys,
  permissionKeys,
} from './authorization.constants';

describe('default role permission mapping', () => {
  it('keeps USER without admin permissions', () => {
    expect(defaultRolePermissionKeys[authorizationRoleKeys.user]).toEqual([
      permissionKeys.edgeConnect,
      permissionKeys.edgeNotifyReceive,
      permissionKeys.ticketMessageSend,
      permissionKeys.ticketRemoteOpenQuickAssist,
    ]);
    expect(defaultRolePermissionKeys[authorizationRoleKeys.user]).not.toContain(
      permissionKeys.settingsWrite,
    );
  });

  it('gives ADMIN every AGENT permission plus catalog and governance writes', () => {
    const agent = defaultRolePermissionKeys[authorizationRoleKeys.agent] ?? [];
    const admin = defaultRolePermissionKeys[authorizationRoleKeys.admin] ?? [];
    expect(admin).toEqual(expect.arrayContaining([...agent]));
    expect(admin).toEqual(
      expect.arrayContaining([
        permissionKeys.routingWrite,
        permissionKeys.groupManage,
        permissionKeys.serviceCatalogWrite,
        permissionKeys.settingsWrite,
        permissionKeys.integrationsQueueManage,
        permissionKeys.auditExport,
        permissionKeys.reportsExport,
      ]),
    );
    expect(defaultRolePermissionKeys[authorizationRoleKeys.admin]).not.toContain(
      permissionKeys.confidentialBreakGlass,
    );
    expect(defaultRolePermissionKeys[authorizationRoleKeys.agent]).toContain(
      permissionKeys.knowledgeArticleWrite,
    );
    expect(defaultRolePermissionKeys[authorizationRoleKeys.agent]).not.toContain(
      permissionKeys.knowledgeArticlePublish,
    );
    expect(defaultRolePermissionKeys[authorizationRoleKeys.admin]).toEqual(
      expect.arrayContaining([
        permissionKeys.knowledgeArticleReview,
        permissionKeys.knowledgeArticlePublish,
      ]),
    );
  });

  it('documents SuperAdmin as the full catalog including break-glass', () => {
    expect(defaultRolePermissionKeys[authorizationRoleKeys.superAdmin]).toEqual(
      allPermissionKeys,
    );
    expect(allPermissionKeys).toContain(permissionKeys.confidentialBreakGlass);
  });
});
