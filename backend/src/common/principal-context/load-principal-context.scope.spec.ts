jest.mock('../prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
import { mapPrincipalUser } from './load-principal-context';
const base = { id: 'u1', email: 'u@example.invalid', displayName: 'U', isActive: true, isLocalOnly: false, mustChangePassword: false, entraObjectId: null, directoryObjectGuid: null, authzVersion: 1, organizationalUnitId: null, groupMembers: [] };
const role = { key: 'AGENT', rolePermissions: [{ permission: { key: 'ticket.read' } }] };
describe('canonical principal assignment mapping', () => {
  it('maps global, OU, and service assignments to discriminated scopes', () => {
    const principal = mapPrincipalUser({ ...base, userRoles: [
      { id: 'global', role, organizationalUnit: null, service: null },
      { id: 'ou', role, organizationalUnit: { id: 'ou1', ouPath: '/ou1' }, service: null },
      { id: 'service', role, organizationalUnit: null, service: { id: 'svc1' } },
    ] });
    expect(principal.assignments.map(({ scope }) => scope)).toEqual([
      { kind: 'global' },
      { kind: 'organizational-unit', organizationalUnitId: 'ou1', organizationalUnitPath: '/ou1' },
      { kind: 'service', serviceId: 'svc1' },
    ]);
  });
  it('fails closed by excluding an assignment with simultaneous OU and service scope', () => {
    const principal = mapPrincipalUser({ ...base, userRoles: [
      { id: 'ambiguous', role, organizationalUnit: { id: 'ou1', ouPath: '/ou1' }, service: { id: 'svc1' } },
    ] });
    expect(principal.assignments).toEqual([]);
  });
});
