import { problemPrincipalScope } from './problem-principal-scope';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));

const principal = { subjectId: 'u1', isActive: true, homeOrganizationalUnitId: 'home', assignments: [{ roleKey: 'AGENT', permissionKeys: ['problem.read'], organizationalUnitId: 'ou1', organizationalUnitPath: '/inside', serviceId: null }] };

describe('problem recipient scope', () => {
  it('rejects missing and inactive principals and users without problem.read', async () => {
    const prisma = {} as never;
    for (const value of [null, { ...principal, isActive: false }, { ...principal, assignments: [] }]) {
      (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(value);
      await expect(problemPrincipalScope(prisma, 'u1')).resolves.toEqual({ id: { in: [] } });
    }
  });
  it('constrains scoped principals to the assigned unit and descendants', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(principal);
    const prisma = { organizationalUnit: { findUnique: async () => ({ ouPath: '/home' }) } };
    const result = await problemPrincipalScope(prisma as never, 'u1');
    expect(JSON.stringify(result)).toContain('/inside/');
    expect(JSON.stringify(result)).not.toContain('/home');
  });
});
