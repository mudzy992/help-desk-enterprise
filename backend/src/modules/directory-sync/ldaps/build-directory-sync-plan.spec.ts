import {
  buildDirectorySyncPlan,
  type BuildDirectorySyncPlanInput,
  type ExistingDirectoryUser,
} from './build-directory-sync-plan';
import type { LdapsDirectoryUserEntry } from './ldaps-directory.types';

const base = 'OU=Korisnici,DC=epbih,DC=ba';
const adminGroup = 'CN=EPHELPDESK_ROLE_ADMIN,OU=Grupe,DC=epbih,DC=ba';
const agentGroup = 'CN=EPHELPDESK_ROLE_AGENT,OU=Grupe,DC=epbih,DC=ba';

const units = [
  { distinguishedName: base, name: 'Korisnici', path: '/Korisnici', guid: 'u0' },
  { distinguishedName: `OU=ED Zenica,${base}`, name: 'ED Zenica', path: '/Korisnici/ED Zenica', guid: 'u1' },
  { distinguishedName: `OU=Breza,OU=ED Zenica,${base}`, name: 'Breza', path: '/Korisnici/ED Zenica/Breza', guid: 'u2' },
];

function adUser(overrides: Partial<LdapsDirectoryUserEntry> = {}): LdapsDirectoryUserEntry {
  return {
    guid: 'guid-ana',
    distinguishedName: `CN=Ana,OU=Breza,OU=ED Zenica,${base}`,
    email: 'ana@epbih.ba',
    userPrincipalName: 'ana@epbih.ba',
    samAccountName: 'ana',
    displayName: 'Ana Anić',
    company: 'EPBiH',
    department: 'Breza',
    memberOf: [],
    disabled: false,
    ...overrides,
  };
}

function dbUser(overrides: Partial<ExistingDirectoryUser> = {}): ExistingDirectoryUser {
  return {
    id: 'user-ana',
    email: 'ana@epbih.ba',
    displayName: 'Ana Anić',
    isActive: true,
    isLocalOnly: false,
    directoryObjectGuid: 'guid-ana',
    directoryDeactivatedAt: null,
    distinguishedName: `CN=Ana,OU=Breza,OU=ED Zenica,${base}`,
    company: 'EPBiH',
    department: 'Breza',
    ouPath: '/Korisnici/ED Zenica/Breza',
    managed: true,
    directoryRoles: [],
    ...overrides,
  };
}

function input(overrides: Partial<BuildDirectorySyncPlanInput> = {}): BuildDirectorySyncPlanInput {
  return {
    configuration: {
      usersBaseDn: base,
      ouMappingStrategy: 'by_dn_ou_path',
      ouMappingOverrides: [],
      roleSource: 'local_db',
      adminGroupDn: adminGroup,
      agentGroupDn: agentGroup,
      maxDeactivationPercent: 10,
    },
    directoryUnits: units,
    directoryUsers: [adUser()],
    existingUnits: [],
    existingUsers: [],
    ...overrides,
  };
}

describe('buildDirectorySyncPlan (paket 1.8)', () => {
  it('first sync: creates the OU tree top-down and the user in her unit', () => {
    const plan = buildDirectorySyncPlan(input());
    expect(plan.organizationalUnits.create.map((unit) => [unit.path, unit.type, unit.parentPath])).toEqual([
      ['/Korisnici', 'DIRECTORATE', null],
      ['/Korisnici/ED Zenica', 'BRANCH', '/Korisnici'],
      ['/Korisnici/ED Zenica/Breza', 'OFFICE', '/Korisnici/ED Zenica'],
    ]);
    expect(plan.users.create).toEqual([
      expect.objectContaining({ guid: 'guid-ana', email: 'ana@epbih.ba', ouPath: '/Korisnici/ED Zenica/Breza' }),
    ]);
    expect(plan.unitCounts).toEqual([{ path: '/Korisnici/ED Zenica', users: 1 }]);
    expect(plan.safeguard.tripped).toBe(false);
  });

  it('is idempotent: a second run over the same data changes nothing', () => {
    const existingUnits = units.map((unit, index) => ({
      id: `ou-${index}`, name: unit.name, type: index === 0 ? 'DIRECTORATE' : index === 1 ? 'BRANCH' : 'OFFICE',
      distinguishedName: unit.distinguishedName, path: unit.path,
      parentPath: index === 0 ? null : units[index - 1].path, company: null, department: null,
    }));
    const plan = buildDirectorySyncPlan(input({ existingUnits, existingUsers: [dbUser()] }));
    expect(plan.organizationalUnits.create).toHaveLength(0);
    expect(plan.organizationalUnits.update).toHaveLength(0);
    expect(plan.users).toMatchObject({ create: [], update: [], deactivate: [], reactivate: [], unchanged: 1 });
  });

  it('adopts an existing non-local account by e-mail and records the GUID', () => {
    const plan = buildDirectorySyncPlan(
      input({ existingUsers: [dbUser({ directoryObjectGuid: null, managed: false, distinguishedName: null })] }),
    );
    expect(plan.users.update[0]).toMatchObject({ userId: 'user-ana', changes: expect.arrayContaining(['directoryObjectGuid']) });
  });

  it('never touches a local account with the same e-mail', () => {
    const plan = buildDirectorySyncPlan(
      input({ existingUsers: [dbUser({ isLocalOnly: true, directoryObjectGuid: null, managed: false })] }),
    );
    expect(plan.users.create).toHaveLength(0);
    expect(plan.exceptions).toEqual([expect.objectContaining({ code: 'EMAIL_TAKEN_BY_LOCAL' })]);
  });

  it('deactivates users disabled in AD or gone from scope', () => {
    const plan = buildDirectorySyncPlan(
      input({
        configuration: { ...input().configuration, maxDeactivationPercent: 100 },
        directoryUsers: [adUser({ disabled: true })],
        existingUsers: [dbUser(), dbUser({ id: 'user-old', email: 'old@epbih.ba', directoryObjectGuid: 'guid-old' })],
      }),
    );
    expect(plan.users.deactivate).toEqual([
      expect.objectContaining({ userId: 'user-ana', reason: 'disabled' }),
      expect.objectContaining({ userId: 'user-old', reason: 'missing' }),
    ]);
  });

  it('trips the safeguard when too many users would be deactivated', () => {
    const existingUsers = Array.from({ length: 10 }, (_, index) =>
      dbUser({ id: `u${index}`, email: `u${index}@epbih.ba`, directoryObjectGuid: `g${index}` }),
    );
    const plan = buildDirectorySyncPlan(input({ directoryUsers: [], existingUsers }));
    expect(plan.safeguard).toMatchObject({ activeManagedUsers: 10, deactivations: 10, percent: 100, tripped: true });
  });

  it('reactivates only users the sync itself deactivated', () => {
    const bySync = buildDirectorySyncPlan(
      input({ existingUsers: [dbUser({ isActive: false, directoryDeactivatedAt: '2026-10-01T00:00:00.000Z' })] }),
    );
    expect(bySync.users.reactivate).toHaveLength(1);
    const byAdmin = buildDirectorySyncPlan(input({ existingUsers: [dbUser({ isActive: false })] }));
    expect(byAdmin.users.reactivate).toHaveLength(0);
    expect(byAdmin.exceptions).toEqual([expect.objectContaining({ code: 'KEPT_INACTIVE_BY_ADMIN' })]);
  });

  it('reports duplicate e-mails, missing e-mails and unknown units', () => {
    const plan = buildDirectorySyncPlan(
      input({
        directoryUsers: [
          adUser({ guid: 'a', email: 'dup@epbih.ba' }),
          adUser({ guid: 'b', email: 'dup@epbih.ba' }),
          adUser({ guid: 'c', email: null }),
          adUser({ guid: 'd', email: 'x@epbih.ba', distinguishedName: `CN=X,OU=Nepoznato,${base}` }),
        ],
      }),
    );
    expect(plan.exceptions.map((exception) => exception.code).sort()).toEqual(
      ['DUPLICATE_EMAIL', 'DUPLICATE_EMAIL', 'NO_EMAIL', 'NO_OU_MATCH'].sort(),
    );
    expect(plan.users.create.map((user) => user.email)).toEqual(['x@epbih.ba']);
  });

  it('ad_groups: grants ADMIN/AGENT in the user unit and revokes stale assignments', () => {
    const plan = buildDirectorySyncPlan(
      input({
        configuration: { ...input().configuration, roleSource: 'ad_groups' },
        directoryUsers: [adUser({ memberOf: [agentGroup.toLowerCase()] })],
        existingUsers: [
          dbUser({
            directoryRoles: [{ userRoleId: 'ur-admin', roleKey: 'ADMIN', ouPath: '/Korisnici/ED Zenica/Breza' }],
          }),
        ],
      }),
    );
    expect(plan.roles.grant).toEqual([
      { userId: 'user-ana', email: 'ana@epbih.ba', roleKey: 'AGENT', ouPath: '/Korisnici/ED Zenica/Breza' },
    ]);
    expect(plan.roles.revoke).toEqual([
      { userRoleId: 'ur-admin', userId: 'user-ana', email: 'ana@epbih.ba', roleKey: 'ADMIN' },
    ]);
  });

  it('local_db: never plans role changes', () => {
    const plan = buildDirectorySyncPlan(input({ directoryUsers: [adUser({ memberOf: [adminGroup] })] }));
    expect(plan.roles).toEqual({ grant: [], revoke: [] });
  });
});
