import {
  evaluateInstallReadiness,
  isInstallReadinessResultReady,
  readMissingReadinessKeys,
  installReadinessMessageKey,
  type InstallReadinessSource,
} from './evaluate-install-readiness';

function readySource(
  overrides: Partial<InstallReadinessSource> = {},
): InstallReadinessSource {
  return {
    readSuperAdminExists: async () => true,
    readAuthMode: async () => ({ saved: true, valid: true }),
    readOrganizationalUnitCount: async () => 1,
    readActiveHandlerMemberCount: async () => 1,
    readActiveServiceWithFormCount: async () => 1,
    readRoutingOutcome: async () => 'EXACT',
    readSeededServiceUnderActiveSla: async () => true,
    readSystemRoleState: async () => ({
      rolesPresent: 4,
      rolesExpected: 4,
      hasDefaultPermissions: true,
    }),
    ...overrides,
  };
}

async function evaluate(overrides: Partial<InstallReadinessSource> = {}) {
  const result = await evaluateInstallReadiness(readySource(overrides));
  return {
    ...result,
    statusOf: (key: string) =>
      result.checks.find((entry) => entry.key === key)?.status,
  };
}

describe('evaluateInstallReadiness', () => {
  it('is ready when every check from the overview is green', async () => {
    const result = await evaluate();
    expect(result.isReady).toBe(true);
    expect(result.checks.map((entry) => entry.key)).toEqual([
      'superAdmin',
      'authMode',
      'organizationalUnit',
      'handlerGroup',
      'service',
      'routing',
      'slaProfile',
      'roles',
    ]);
    expect(result.checks.every((entry) => entry.status === 'ok')).toBe(true);
    expect(result.checks[0].messageKey).toBe('install.readiness.superAdmin');
  });

  it('blocks on every unmet requirement and names it', async () => {
    const result = await evaluate({
      readSuperAdminExists: async () => false,
      readAuthMode: async () => ({ saved: false, valid: false }),
      readOrganizationalUnitCount: async () => 0,
      readActiveHandlerMemberCount: async () => 0,
      readActiveServiceWithFormCount: async () => 0,
      readRoutingOutcome: async () => null,
      readSeededServiceUnderActiveSla: async () => false,
      readSystemRoleState: async () => ({
        rolesPresent: 0,
        rolesExpected: 4,
        hasDefaultPermissions: false,
      }),
    });

    expect(result.isReady).toBe(false);
    expect(readMissingReadinessKeys(result.checks)).toEqual([
      'superAdmin',
      'authMode',
      'organizationalUnit',
      'handlerGroup',
      'service',
      'routing',
      'slaProfile',
      'roles',
    ]);
  });

  it('treats a partial routing match as not ready', async () => {
    const result = await evaluate({ readRoutingOutcome: async () => 'POLICY' });
    expect(result.statusOf('routing')).toBe('missing');
    expect(result.isReady).toBe(false);
  });

  it('does not accept a stored authentication mode it cannot parse', async () => {
    const result = await evaluate({
      readAuthMode: async () => ({ saved: true, valid: false }),
    });
    expect(result.statusOf('authMode')).toBe('missing');
  });

  it('accepts a system role set without default permissions only when roles exist', async () => {
    const withoutLinks = await evaluate({
      readSystemRoleState: async () => ({
        rolesPresent: 0,
        rolesExpected: 4,
        hasDefaultPermissions: true,
      }),
    });
    expect(withoutLinks.statusOf('roles')).toBe('missing');

    const partiallyLinked = await evaluate({
      readSystemRoleState: async () => ({
        rolesPresent: 4,
        rolesExpected: 4,
        hasDefaultPermissions: false,
      }),
    });
    expect(partiallyLinked.statusOf('roles')).toBe('missing');
  });

  it('reports a deferred check without blocking the installation', async () => {
    // D4: "Podesi kasnije" is a decision, not a failure — only `missing` blocks.
    expect(
      isInstallReadinessResultReady([
        {
          key: 'slaProfile',
          status: 'skipped',
          messageKey: 'install.readiness.slaProfile',
        },
      ]),
    ).toBe(true);
    expect(
      isInstallReadinessResultReady([
        {
          key: 'slaProfile',
          status: 'missing',
          messageKey: 'install.readiness.slaProfile',
        },
      ]),
    ).toBe(false);

    const result = await evaluate();
    expect(readMissingReadinessKeys(result.checks)).toEqual([]);
    expect(installReadinessMessageKey('profileSteps')).toBe(
      'install.readiness.profileSteps',
    );
  });
});
