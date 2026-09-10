import { resolveAuthorizationScopeValue } from './resolve-authorization-scope';

describe('resolveAuthorizationScopeValue', () => {
  it('reads params before body and query', () => {
    expect(
      resolveAuthorizationScopeValue(
        {
          params: { organizationalUnitId: 'from-params' },
          body: { organizationalUnitId: 'from-body' },
          query: { organizationalUnitId: 'from-query' },
        },
        { field: 'organizationalUnitId' },
      ),
    ).toBe('from-params');
  });

  it('fails closed for missing locators and blank values', () => {
    expect(
      resolveAuthorizationScopeValue(
        { params: { organizationalUnitId: '   ' } },
        { field: 'organizationalUnitId' },
      ),
    ).toBeNull();
    expect(
      resolveAuthorizationScopeValue(
        { params: { organizationalUnitId: 'ou-1' } },
        null,
      ),
    ).toBeNull();
  });

  it('ignores provider-specific claim fields on the request', () => {
    expect(
      resolveAuthorizationScopeValue(
        {
          params: { oid: 'entra-oid', roles: 'SUPER_ADMIN' },
          body: { tid: 'tenant-id' },
        },
        { field: 'organizationalUnitId' },
      ),
    ).toBeNull();
  });
});
