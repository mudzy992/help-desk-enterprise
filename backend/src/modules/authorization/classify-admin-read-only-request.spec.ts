import {
  classifyAdminReadOnlyRequest,
  isAdminReadOnlyModuleOwnershipExplicit,
  listAdminReadOnlyModuleCandidates,
  resolveAdminReadOnlyModule,
} from './classify-admin-read-only-request';
import { adminReadOnlyModuleKeys } from './read-only-mode.constants';

describe('classifyAdminReadOnlyRequest', () => {
  it('keeps a registered read handler readable on a mutating verb', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/policy-packs/validate',
        handlerIdentity: 'PolicyPacksController.validate',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: false,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/config-versions/version-1/shadow',
        handlerIdentity: 'ConfigVersioningController.shadow',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: false,
    });
  });

  it('classifies a mutating directory read by handler identity, not by its name', () => {
    // `POST /directory-sync/read` upserts OUs/users (`materializeDirectoryRead`);
    // it used to be exempted as a "read" by a URL allowlist.
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/directory-sync/read',
        handlerIdentity: 'DirectorySyncController.read',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.admin,
      isMutation: true,
    });
  });

  it('fails closed for an unknown mutating handler inside a lockable module', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/settings',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/directory-sync/read',
        handlerIdentity: 'UncataloguedController.read',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.admin,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'GET',
        path: '/settings',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: false,
    });
  });

  it('classifies catalogued writes as mutations of their module', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/organizational-units',
        handlerIdentity: 'OrganizationalUnitsController.create',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.admin,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'PUT',
        path: '/settings',
        handlerIdentity: 'SettingsController.updateSetting',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/services/service-1/lifecycle',
        handlerIdentity: 'ServicesController.transitionLifecycle',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/services/service-1/form/versions',
        handlerIdentity: 'ServiceFormsController.createFormVersion',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceForms,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'DELETE',
        path: '/sla/rules/rule-1',
        handlerIdentity: 'SlaRulesController.delete',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.sla,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'PATCH',
        path: '/routing/rules/rule-1',
        handlerIdentity: 'RoutingController.updateRule',
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.routing,
      isMutation: true,
    });
  });

  it('ignores non-admin routes', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/auth/login',
        handlerIdentity: 'AuthenticationController.login',
      }),
    ).toBeNull();
  });

  it('owns service form paths as a declared sub-module of the catalog', () => {
    expect(
      resolveAdminReadOnlyModule('/services/service-1/form/versions'),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceForms,
      candidateModuleKeys: [
        adminReadOnlyModuleKeys.serviceForms,
        adminReadOnlyModuleKeys.serviceCatalog,
      ],
    });
    expect(
      isAdminReadOnlyModuleOwnershipExplicit(
        listAdminReadOnlyModuleCandidates('/services/service-1/form'),
      ),
    ).toBe(true);
    expect(
      resolveAdminReadOnlyModule('/services/service-1/formula'),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
      candidateModuleKeys: [adminReadOnlyModuleKeys.serviceCatalog],
    });
    expect(
      isAdminReadOnlyModuleOwnershipExplicit(
        listAdminReadOnlyModuleCandidates('/settings'),
      ),
    ).toBe(true);
    expect(
      isAdminReadOnlyModuleOwnershipExplicit([
        adminReadOnlyModuleKeys.settings,
        adminReadOnlyModuleKeys.sla,
      ]),
    ).toBe(false);
  });
});
