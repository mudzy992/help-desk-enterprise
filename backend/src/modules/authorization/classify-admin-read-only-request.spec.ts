import { classifyAdminReadOnlyRequest } from './classify-admin-read-only-request';
import { adminReadOnlyModuleKeys } from './read-only-mode.constants';

describe('classifyAdminReadOnlyRequest', () => {
  it('keeps admin GET operations as reads', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'GET',
        path: '/organizational-units/tree',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.admin,
      isMutation: false,
    });
  });

  it('classifies create, update, delete, and assign as mutations', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/organizational-units',
        isDecoratedReadOperation: false,
      })?.isMutation,
    ).toBe(true);
    expect(
      classifyAdminReadOnlyRequest({
        method: 'PATCH',
        path: '/organizational-units/ou-1',
        isDecoratedReadOperation: false,
      })?.isMutation,
    ).toBe(true);
    expect(
      classifyAdminReadOnlyRequest({
        method: 'DELETE',
        path: '/organizational-units/ou-1',
        isDecoratedReadOperation: false,
      })?.isMutation,
    ).toBe(true);
    expect(
      classifyAdminReadOnlyRequest({
        method: 'PUT',
        path: '/organizational-units/user-mappings',
        isDecoratedReadOperation: false,
      })?.isMutation,
    ).toBe(true);
  });

  it('keeps directory read and policy validate available', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/directory-sync/read',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.admin,
      isMutation: false,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/policy-packs/validate',
        isDecoratedReadOperation: true,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: false,
    });
  });

  it('classifies apply and unknown admin POST as mutations', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/policy-packs/apply',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.settings,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/directory-sync/sync',
        isDecoratedReadOperation: false,
      })?.isMutation,
    ).toBe(true);
  });

  it('ignores non-admin routes', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/auth/login',
        isDecoratedReadOperation: false,
      }),
    ).toBeNull();
  });

  it('classifies service catalog writes as service_catalog mutations', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'GET',
        path: '/services',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
      isMutation: false,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/services/service-1/lifecycle',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceCatalog,
      isMutation: true,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'DELETE',
        path: '/service-categories/category-1',
        isDecoratedReadOperation: false,
      })?.isMutation,
    ).toBe(true);
  });

  it('classifies service form writes as service_forms mutations', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'GET',
        path: '/services/service-1/form',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceForms,
      isMutation: false,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/services/service-1/form/versions',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.serviceForms,
      isMutation: true,
    });
  });

  it('classifies routing coverage as a read and rule writes as routing mutations', () => {
    expect(
      classifyAdminReadOnlyRequest({
        method: 'GET',
        path: '/routing/coverage',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.routing,
      isMutation: false,
    });
    expect(
      classifyAdminReadOnlyRequest({
        method: 'POST',
        path: '/routing/rules',
        isDecoratedReadOperation: false,
      }),
    ).toEqual({
      moduleKey: adminReadOnlyModuleKeys.routing,
      isMutation: true,
    });
  });
});
