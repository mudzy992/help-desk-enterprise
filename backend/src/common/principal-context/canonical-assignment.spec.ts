import { resolveCanonicalScope } from './canonical-assignment';
describe('canonical assignment scope', () => {
  it.each([
    [{ organizationalUnitId: null, organizationalUnitPath: null, serviceId: null }, { kind: 'global' }],
    [{ organizationalUnitId: 'ou-1', organizationalUnitPath: '/root/ou-1', serviceId: null }, { kind: 'organizational-unit', organizationalUnitId: 'ou-1', organizationalUnitPath: '/root/ou-1' }],
    [{ organizationalUnitId: null, organizationalUnitPath: null, serviceId: 'svc-1' }, { kind: 'service', serviceId: 'svc-1' }],
  ])('accepts one canonical scope kind', (input, expected) => expect(resolveCanonicalScope(input)).toEqual(expected));
  it.each([
    { organizationalUnitId: 'ou-1', organizationalUnitPath: '/ou-1', serviceId: 'svc-1' },
    { organizationalUnitId: 'ou-1', organizationalUnitPath: null, serviceId: null },
    { organizationalUnitId: null, organizationalUnitPath: '/ou-1', serviceId: null },
  ])('rejects ambiguous or incomplete scope', (input) => expect(resolveCanonicalScope(input)).toBeNull());
});
