import { UsersError } from '../users/users.error';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import type { CreateInstallTeamMember } from './install-team.service';

/**
 * F2: the team step must create real accounts through the users domain and put
 * them in the group the structure step created. The domain call itself is
 * injected here (see `CreateInstallTeamMember`), so this spec asserts the
 * wizard's own contract: what it asks the domain for, what it does with the
 * answer, and what it answers the operator.
 */
type CreatedAccount = Parameters<CreateInstallTeamMember>[1];

function creatorThat(
  harness: Awaited<ReturnType<typeof createInstallWizardHarness>>,
  options: { readonly temporaryPassword?: string | null } = {},
): { readonly calls: CreatedAccount[]; readonly create: CreateInstallTeamMember } {
  const calls: CreatedAccount[] = [];
  let sequence = 1;
  const create: CreateInstallTeamMember = async (_prisma, input) => {
    calls.push(input);
    const user = {
      id: `invited-${sequence++}`,
      displayName: input.displayName,
      email: input.email,
    };
    // The listing reads the users table, exactly like after a real create.
    harness.memory.seedUser(
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isActive: true,
        isLocalOnly: true,
        localPasswordHash: 'hash',
        entraObjectId: null,
      },
      input.roleKey,
    );
    const temporaryPassword =
      options.temporaryPassword === undefined
        ? 'privremena-lozinka-1'
        : options.temporaryPassword;
    return {
      user,
      temporaryPassword,
      temporaryPasswordDelivery: temporaryPassword === null ? 'email' : 'ui',
    };
  };
  return { calls, create };
}

async function createTeamHarness() {
  const harness = await createInstallWizardHarness();
  await harness.seedMinimum();
  return harness;
}

describe('InstallTeamService', () => {
  it('creates the accounts in the domain and adds them to the seeded group', async () => {
    const harness = await createTeamHarness();
    const { calls, create } = creatorThat(harness);

    const result = await harness.teamService.save(
      {
        members: [
          { displayName: 'Amina Hodžić', email: 'AMINA@Example.com', roleKey: 'AGENT' },
          { displayName: 'Emir Softić', email: 'emir@example.com', roleKey: 'ADMIN' },
        ],
      },
      create,
    );

    expect(calls).toEqual([
      expect.objectContaining({
        displayName: 'Amina Hodžić',
        email: 'amina@example.com',
        roleKey: 'AGENT',
        actorUserId: harness.actorUserId,
      }),
      expect.objectContaining({
        displayName: 'Emir Softić',
        email: 'emir@example.com',
        roleKey: 'ADMIN',
      }),
    ]);
    // The handler group carries the organisational unit, and the wizard acts as
    // the founder (super admin) so the domain applies the same rules as /users.
    expect(calls[0]).toMatchObject({
      organizationalUnitId: expect.any(String),
      actorIsSuperAdmin: true,
      requestId: null,
    });
    expect(result.created.map((member) => member.email)).toEqual([
      'amina@example.com',
      'emir@example.com',
    ]);
    // Owner decision 2: without SMTP the domain hands the password back for the
    // one-time dialog, never for storage.
    expect(result.created[0]).toEqual({
      userId: 'invited-1',
      displayName: 'Amina Hodžić',
      email: 'amina@example.com',
      roleKey: 'AGENT',
      temporaryPassword: 'privremena-lozinka-1',
      temporaryPasswordDelivery: 'ui',
    });
    const group = await harness.seedService.getStatus();
    expect(
      harness.memory.listGroupMembers(group.seed.fallbackGroup?.id ?? ''),
    ).toHaveLength(3);
    expect(result.isTeamInvited).toBe(true);
    expect(result.members.map((member) => member.isSuperAdmin)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('reports the founder alone as an unanswered step', async () => {
    const harness = await createTeamHarness();

    const status = await harness.teamService.getStatus();

    expect(status.team.isTeamInvited).toBe(false);
    expect(status.team.members).toHaveLength(1);
    expect(status.team.members[0]).toMatchObject({
      email: 'admin@example.com',
      isSuperAdmin: true,
    });
  });

  it('shows the temporary password once and never again after a reload', async () => {
    const harness = await createTeamHarness();
    const { create } = creatorThat(harness);

    const saved = await harness.teamService.save(
      {
        members: [{ displayName: 'Amina Hodžić', email: 'amina@example.com', roleKey: 'AGENT' }],
      },
      create,
    );
    expect(saved.created[0].temporaryPassword).toBe('privremena-lozinka-1');

    const reloaded = await harness.teamService.getStatus();
    expect(JSON.stringify(reloaded)).not.toContain('privremena-lozinka-1');
  });

  it('answers a taken e-mail address with a conflict', async () => {
    const harness = await createTeamHarness();
    const create: CreateInstallTeamMember = async () => {
      throw new UsersError('EMAIL_CONFLICT');
    };

    await expect(
      harness.teamService.save(
        {
          members: [{ displayName: 'Amina Hodžić', email: 'admin@example.com', roleKey: 'AGENT' }],
        },
        create,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'INSTALL_TEAM_EMAIL_CONFLICT' },
    });
  });

  it('asks for the structure before it can invite anybody', async () => {
    const harness = await createInstallWizardHarness();
    const { create } = creatorThat(harness);

    await expect(
      harness.teamService.save(
        {
          members: [{ displayName: 'Amina Hodžić', email: 'amina@example.com', roleKey: 'AGENT' }],
        },
        create,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'INSTALL_TEAM_STRUCTURE_REQUIRED' },
    });
  });

  it('validates every row before the first account is created', async () => {
    const harness = await createTeamHarness();
    const { calls, create } = creatorThat(harness);

    await expect(
      harness.teamService.save(
        {
          members: [
            { displayName: 'Amina Hodžić', email: 'amina@example.com', roleKey: 'AGENT' },
            { displayName: '', email: 'emir@example.com', roleKey: 'ADMIN' },
          ],
        },
        create,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_TEAM_INVALID' } });
    expect(calls).toEqual([]);
  });

  it('refuses the same address twice in one request', async () => {
    const harness = await createTeamHarness();
    const { create } = creatorThat(harness);

    await expect(
      harness.teamService.save(
        {
          members: [
            { displayName: 'Amina Hodžić', email: 'amina@example.com', roleKey: 'AGENT' },
            { displayName: 'Amina H.', email: 'Amina@example.com', roleKey: 'AGENT' },
          ],
        },
        create,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_TEAM_INVALID' } });
  });

  it('refuses a role the wizard cannot hand out and an empty list', async () => {
    const harness = await createTeamHarness();
    const { create } = creatorThat(harness);

    await expect(
      harness.teamService.save(
        {
          members: [
            {
              displayName: 'Amina Hodžić',
              email: 'amina@example.com',
              roleKey: 'SUPER_ADMIN' as 'AGENT',
            },
          ],
        },
        create,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSTALL_TEAM_INVALID' } });
    await expect(harness.teamService.save({ members: [] }, create)).rejects.toMatchObject(
      { response: { code: 'INSTALL_TEAM_INVALID' } },
    );
  });
});
