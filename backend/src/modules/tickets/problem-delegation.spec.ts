import { assertProblemDelegation } from './problem-delegation';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));

const scopedAssignment = {
  roleKey: 'AGENT',
  permissionKeys: ['problem.read', 'problem.manage', 'problem.close'],
  organizationalUnitId: 'ou1',
  organizationalUnitPath: '/inside',
  serviceId: null,
};
const principal = {
  subjectId: 'u1',
  isActive: true,
  homeOrganizationalUnitId: null,
  assignments: [scopedAssignment],
};
const globalPrincipal = {
  ...principal,
  assignments: [{ ...scopedAssignment, roleKey: 'ADMIN', organizationalUnitId: null, organizationalUnitPath: null }],
};
const noClose = {
  ...principal,
  assignments: [{ ...scopedAssignment, permissionKeys: ['problem.read', 'problem.manage'] }],
};

function setup(options: {
  linked?: boolean;
  status?: string;
  groupId?: string | null;
  member?: boolean;
  problemPath?: string | null;
  homePath?: string | null;
} = {}) {
  const problemTicket = { count: jest.fn(async () => (options.linked === false ? 0 : 1)) };
  const problem = {
    findUnique: jest.fn(async () => ({
      status: options.status ?? 'RESOLVED',
      groupId: options.groupId === undefined ? 'g1' : options.groupId,
      organizationalUnit: { ouPath: options.problemPath === undefined ? '/inside' : options.problemPath },
    })),
  };
  const organizationalUnit = { findUnique: jest.fn(async () => ({ ouPath: options.homePath ?? '/home' })) };
  const groupMember = { count: jest.fn(async () => (options.member === false ? 0 : 1)) };
  return { prisma: { problemTicket, problem, organizationalUnit, groupMember } as never, problemTicket, problem, groupMember };
}

const input = { problemId: 'p1', ticketId: 't1', actorUserId: 'u1' };

describe('problem delegation guard (BA-problems-05)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('rejects a ticket that is no longer linked to the problem before reading the problem', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(principal);
    const { prisma, problem } = setup({ linked: false });
    await expect(assertProblemDelegation(prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(problem.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a problem that is missing or not resolved any more', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(principal);
    await expect(assertProblemDelegation(setup({ status: 'INVESTIGATING' }).prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const missing = setup();
    missing.problem.findUnique.mockResolvedValueOnce(null as never);
    await expect(assertProblemDelegation(missing.prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(loadPrincipalContext).not.toHaveBeenCalled();
  });

  it('fails closed for a missing or inactive principal', async () => {
    for (const value of [null, { ...principal, isActive: false }]) {
      (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(value);
      await expect(assertProblemDelegation(setup().prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('requires problem.read, problem.manage and problem.close', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(noClose);
    await expect(assertProblemDelegation(setup().prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires the problem permissions in the problem unit', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(principal);
    await expect(assertProblemDelegation(setup({ problemPath: '/outside' }).prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(principal);
    await expect(assertProblemDelegation(setup({ problemPath: null }).prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires membership of the problem group', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(principal);
    await expect(assertProblemDelegation(setup({ member: false }).prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(assertProblemDelegation(setup({ groupId: null }).prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('accepts a current member of the problem group with the scoped permissions', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValue(principal);
    const { prisma, groupMember } = setup();
    await expect(assertProblemDelegation(prisma, input)).resolves.toBeUndefined();
    expect(groupMember.count).toHaveBeenCalledWith({ where: { groupId: 'g1', userId: 'u1' } });
  });

  it('lets an installation-wide admin bypass the group membership but not the permission', async () => {
    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce(globalPrincipal);
    const admin = setup({ member: false });
    await expect(assertProblemDelegation(admin.prisma, input)).resolves.toBeUndefined();
    expect(admin.groupMember.count).not.toHaveBeenCalled();

    (loadPrincipalContext as jest.Mock).mockResolvedValueOnce({ ...globalPrincipal, assignments: [{ ...globalPrincipal.assignments[0], permissionKeys: ['problem.read'] }] });
    await expect(assertProblemDelegation(setup({ member: false }).prisma, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
