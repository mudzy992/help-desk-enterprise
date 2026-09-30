import type { LdapsDirectoryComputerEntry } from '../../directory-sync/ldaps/ldaps-directory.types';
import { buildComputerFilter } from '../../directory-sync/ldaps/ldaps-directory.types';
import { fileTimeToDate, mapLdapsComputerEntry } from '../../directory-sync/ldaps/map-ldaps-entries';
import {
  compileNamePattern,
  createUnitResolver,
  planDirectoryComputers,
  type DirectoryAssetState,
  type DirectoryPlanInput,
} from './plan-directory-computers';

const base = 'OU=Korisnici,DC=example,DC=com';
const now = new Date('2026-09-30T10:00:00Z');

function computer(overrides: Partial<LdapsDirectoryComputerEntry> = {}): LdapsDirectoryComputerEntry {
  return {
    guid: 'guid-1',
    distinguishedName: `CN=PC-AMRA.H,OU=Racunari,OU=Direkcija,${base}`,
    name: 'PC-AMRA.H',
    dnsHostName: 'pc-amra.h.example.com',
    operatingSystem: 'Windows 11 Pro',
    operatingSystemVersion: '10.0 (22631)',
    lastLogonAt: new Date('2026-09-29T08:00:00Z'),
    managedBy: null,
    description: null,
    disabled: false,
    ...overrides,
  };
}

function asset(overrides: Partial<DirectoryAssetState> = {}): DirectoryAssetState {
  return {
    id: 'asset-1',
    externalId: 'guid-1',
    source: 'DIRECTORY',
    typeId: 'type-computer',
    name: 'PC-AMRA.H',
    status: 'IN_USE',
    organizationalUnitId: 'unit-dir',
    assignedUserId: 'user-amra',
    assignmentSuggested: true,
    lastSeenAt: new Date('2026-09-29T08:00:00Z'),
    missingFromDirectoryAt: null,
    attributes: { hostname: 'pc-amra.h.example.com', os: 'Windows 11 Pro 10.0 (22631)' },
    version: 2,
    ...overrides,
  };
}

function input(overrides: Partial<DirectoryPlanInput> = {}): DirectoryPlanInput {
  return {
    computers: [computer()],
    linked: [],
    adoptable: new Map(),
    users: [
      { id: 'user-amra', email: 'amra.h@example.com', distinguishedName: `CN=Amra H,OU=Direkcija,${base}`, isActive: true },
      { id: 'user-edin', email: 'edin@example.com', distinguishedName: `CN=Edin,OU=Direkcija,${base}`, isActive: true },
      { id: 'user-old', email: 'old@example.com', distinguishedName: `CN=Old,OU=Direkcija,${base}`, isActive: false },
    ],
    units: [
      { id: 'unit-root', ouPath: '/Korisnici', distinguishedName: base },
      { id: 'unit-dir', ouPath: '/Korisnici/Direkcija', distinguishedName: `OU=Direkcija,${base}` },
      { id: 'unit-it', ouPath: '/Korisnici/IT', distinguishedName: `OU=IT,${base}` },
    ],
    overrides: [],
    computerType: { id: 'type-computer', key: 'computer', attributeKeys: new Set(['hostname', 'os', 'ramGb']) },
    serverType: { id: 'type-server', key: 'server', attributeKeys: new Set(['os', 'ipAddress']) },
    userMatch: ['managedBy', 'namePattern'],
    namePattern: '^PC-(?<login>[a-z.]+)$',
    defaultUnitId: null,
    maxMissingPercent: 10,
    now,
    ...overrides,
  };
}

describe('AD computer entries (paket 3.2 §12)', () => {
  it('converts FILETIME and ignores "never"', () => {
    expect(fileTimeToDate('133720416000000000')?.toISOString()).toBe('2024-09-29T00:00:00.000Z');
    expect(fileTimeToDate('0')).toBeNull();
    expect(fileTimeToDate('9223372036854775807')).toBeNull();
    expect(fileTimeToDate('abc')).toBeNull();
  });

  it('maps an entry and flags disabled accounts; entries without GUID are dropped', () => {
    const guid = Buffer.from('78563412bc9af0de0123456789abcdef', 'hex');
    const entry = mapLdapsComputerEntry({ objectGUID: guid, distinguishedName: `CN=PC1,${base}`, cn: 'PC1', userAccountControl: '4098' });
    expect(entry).toMatchObject({ guid: '12345678-9abc-def0-0123-456789abcdef', name: 'PC1', disabled: true, lastLogonAt: null });
    expect(mapLdapsComputerEntry({ distinguishedName: `CN=PC2,${base}` })).toBeNull();
  });

  it('excludes disabled computers in the LDAP filter unless asked', () => {
    expect(buildComputerFilter(false)).toContain('1.2.840.113556.1.4.803:=2');
    expect(buildComputerFilter(true)).toBe('(objectCategory=computer)');
  });

  it('accepts only name patterns with a login group', () => {
    expect(compileNamePattern('^PC-(?<login>.+)$')).not.toBeNull();
    expect(compileNamePattern('^PC-(.+)$')).toBeNull();
    expect(compileNamePattern('([')).toBeNull();
    expect(compileNamePattern('')).toBeNull();
  });

  it('places a computer in the nearest known OU, then by path, then the default', () => {
    const resolve = createUnitResolver({ ...input(), defaultUnitId: 'unit-it' });
    expect(resolve(`CN=X,OU=Racunari,OU=Direkcija,${base}`)).toBe('unit-dir');
    expect(resolve('CN=X,OU=Laptopi,OU=Negdje,DC=other,DC=com')).toBe('unit-it');
    const withOverride = createUnitResolver({ ...input(), overrides: [{ dnSuffix: `OU=Racunari,OU=Direkcija,${base}`, ouPath: '/Korisnici/IT' }] });
    expect(withOverride(`CN=X,OU=Racunari,OU=Direkcija,${base}`)).toBe('unit-it');
  });
});

describe('planDirectoryComputers', () => {
  it('creates a DIRECTORY asset with OS, hostname and a suggested user from the name pattern', () => {
    const plan = planDirectoryComputers(input());
    expect(plan.totals).toMatchObject({ seen: 1, create: 1, suggestions: 1 });
    expect(plan.creates[0]).toEqual({
      externalId: 'guid-1',
      typeId: 'type-computer',
      name: 'PC-AMRA.H',
      organizationalUnitId: 'unit-dir',
      assignedUserId: 'user-amra',
      status: 'IN_USE',
      lastSeenAt: new Date('2026-09-29T08:00:00Z'),
      attributes: { hostname: 'pc-amra.h.example.com', os: 'Windows 11 Pro 10.0 (22631)' },
      userMatchedBy: 'namePattern',
    });
  });

  it('prefers managedBy, ignores inactive users and uses the server type for server OS', () => {
    const plan = planDirectoryComputers(
      input({
        computers: [
          computer({ guid: 'g-a', name: 'PC-OLD', managedBy: `cn=edin,ou=direkcija,${base}` }),
          computer({ guid: 'g-b', name: 'PC-OLD2', managedBy: `CN=Old,OU=Direkcija,${base}` }),
          computer({ guid: 'g-c', name: 'SRV-01', operatingSystem: 'Windows Server 2022 Standard' }),
        ],
      }),
    );
    expect(plan.creates.map((entry) => [entry.name, entry.assignedUserId, entry.status, entry.typeId])).toEqual([
      ['PC-OLD', 'user-edin', 'IN_USE', 'type-computer'],
      ['PC-OLD2', null, 'IN_STOCK', 'type-computer'],
      ['SRV-01', null, 'IN_STOCK', 'type-server'],
    ]);
    expect(plan.creates[2].attributes).toEqual({ os: 'Windows Server 2022 Standard 10.0 (22631)' });
  });

  it('matches a login in the description only when unique', () => {
    const plan = planDirectoryComputers(
      input({
        userMatch: ['description'],
        computers: [computer({ guid: 'g-1', name: 'A', description: 'Korisnik: edin@example.com' }), computer({ guid: 'g-2', name: 'B', description: 'amra.h i edin' })],
      }),
    );
    expect(plan.creates.map((entry) => entry.assignedUserId)).toEqual(['user-edin', null]);
  });

  it('skips computers without a unit or type', () => {
    const plan = planDirectoryComputers(
      input({ computers: [computer({ distinguishedName: 'CN=X,OU=Drugo,DC=other,DC=com' })], computerType: { id: 't', key: 'computer', attributeKeys: new Set() } }),
    );
    expect(plan.skipped).toEqual([{ externalId: 'guid-1', name: 'PC-AMRA.H', reason: 'no_unit' }]);
    const noType = planDirectoryComputers(input({ computerType: null, serverType: null }));
    expect(noType.skipped[0].reason).toBe('no_type');
  });

  it('leaves an unchanged computer alone and only touches lastSeenAt without history', () => {
    expect(planDirectoryComputers(input({ linked: [asset()] })).totals).toMatchObject({ unchanged: 1, update: 0 });
    const seen = planDirectoryComputers(input({ linked: [asset()], computers: [computer({ lastLogonAt: new Date('2026-09-30T07:00:00Z') })] }));
    expect(seen.updates[0]).toMatchObject({ kind: 'update', changes: [], data: { lastSeenAt: new Date('2026-09-30T07:00:00Z') } });
  });

  it('follows AD for DIRECTORY assets (name, OU, OS) and clears the missing marker', () => {
    const plan = planDirectoryComputers(
      input({
        linked: [asset({ name: 'OLD', organizationalUnitId: 'unit-it', missingFromDirectoryAt: new Date('2026-09-01'), attributes: { hostname: 'pc-amra.h.example.com', os: 'Windows 10' } })],
      }),
    );
    expect(plan.updates[0]).toMatchObject({
      kind: 'restore',
      changes: ['attributes', 'name', 'organizationalUnitId', 'missingFromDirectoryAt'],
      data: { name: 'PC-AMRA.H', organizationalUnitId: 'unit-dir', missingFromDirectoryAt: null, attributes: { os: 'Windows 11 Pro 10.0 (22631)' } },
    });
  });

  it('never overrides a manual assignment — reports a conflict instead', () => {
    const plan = planDirectoryComputers(input({ linked: [asset({ assignedUserId: 'user-edin', assignmentSuggested: false })] }));
    expect(plan.updates).toEqual([]);
    expect(plan.conflicts).toEqual([{ assetId: 'asset-1', name: 'PC-AMRA.H', assignedUserId: 'user-edin', suggestedUserId: 'user-amra', matchedBy: 'namePattern' }]);
  });

  it('replaces an earlier suggestion and assigns an unassigned computer in stock', () => {
    const replaced = planDirectoryComputers(input({ linked: [asset({ assignedUserId: 'user-edin', assignmentSuggested: true })] }));
    expect(replaced.updates[0].data).toMatchObject({ assignedUserId: 'user-amra', assignmentSuggested: true });
    const stock = planDirectoryComputers(input({ linked: [asset({ assignedUserId: null, assignmentSuggested: false, status: 'IN_STOCK' })] }));
    expect(stock.updates[0].data).toMatchObject({ assignedUserId: 'user-amra', status: 'IN_USE' });
    const repair = planDirectoryComputers(input({ linked: [asset({ assignedUserId: null, assignmentSuggested: false, status: 'IN_REPAIR' })] }));
    expect(repair.totals.unchanged).toBe(1);
  });

  it('adopts a unique manual asset with the same hostname and keeps its data', () => {
    const manual = asset({ id: 'manual-1', externalId: null, source: 'MANUAL', typeId: 'type-laptop', name: 'Laptop Amra', assignedUserId: 'user-amra', assignmentSuggested: false, attributes: { hostname: 'PC-AMRA.H' } });
    const plan = planDirectoryComputers(input({ adoptable: new Map([['pc-amra.h', [manual]]]) }));
    expect(plan.totals).toMatchObject({ adopt: 1, create: 0 });
    expect(plan.updates[0]).toMatchObject({ assetId: 'manual-1', kind: 'adopt', data: { externalId: 'guid-1', attributes: { hostname: 'PC-AMRA.H', os: 'Windows 11 Pro 10.0 (22631)' } } });
    expect(plan.updates[0].data.name).toBeUndefined();
    const twice = planDirectoryComputers(input({ adoptable: new Map([['pc-amra.h', [manual, { ...manual, id: 'manual-2' }]]]) }));
    expect(twice.skipped[0].reason).toBe('hostname_ambiguous');
  });

  it('flags missing computers but holds back after a suspicious read', () => {
    const linked = Array.from({ length: 20 }, (_, index) => asset({ id: `a-${index}`, externalId: `g-${index}` }));
    const oneGone = planDirectoryComputers(input({ linked, computers: linked.slice(1).map((entry) => computer({ guid: entry.externalId as string, name: entry.name })) }));
    expect(oneGone.totals.missing).toBe(1);
    expect(oneGone.updates.find((entry) => entry.kind === 'missing')).toMatchObject({ assetId: 'a-0', data: { missingFromDirectoryAt: now } });

    const halfGone = planDirectoryComputers(input({ linked, computers: linked.slice(10).map((entry) => computer({ guid: entry.externalId as string, name: entry.name })) }));
    expect(halfGone.missingGuardTripped).toBe(true);
    expect(halfGone.totals.missing).toBe(0);
    expect(halfGone.wouldFlagMissing).toBe(10);

    expect(planDirectoryComputers(input({ linked: [asset()], computers: [] })).missingGuardTripped).toBe(true);
  });
});
