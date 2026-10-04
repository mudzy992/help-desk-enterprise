import { validateAssetAttributes, parseAttributeValue, type AssetAttributeDefinition } from './asset-attributes';
import { collectRelationImpact, wouldCreateRelationCycle, type RelationEdge } from './asset-relations';
import { assetViewerFromContext, isPathInScope, resolveAssetScope, unitScopeWhere } from './asset-viewer';
import { assetStatuses, canTransitionAssetStatus } from './assets.constants';
import { diffAsset } from './assets.service';
import { assertNamePattern, parseReminderDays, parseUserMatch } from '../settings/definitions/asset-settings';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

function definition(overrides: Partial<AssetAttributeDefinition> & { key: string }): AssetAttributeDefinition {
  return { dataType: 'TEXT', options: null, isRequired: false, isUnique: false, archivedAt: null, ...overrides };
}

describe('asset attributes (§4)', () => {
  const definitions = [
    definition({ key: 'ramGb', dataType: 'NUMBER', isRequired: true }),
    definition({ key: 'color', dataType: 'BOOLEAN' }),
    definition({ key: 'bought', dataType: 'DATE' }),
    definition({ key: 'env', dataType: 'SELECT', options: ['production', 'test'] }),
    definition({ key: 'old', archivedAt: new Date() }),
  ];

  it('parses numbers with a decimal comma, local booleans, European dates and options case-insensitively', () => {
    const result = validateAssetAttributes({
      definitions,
      values: { ramGb: '15,5', color: 'da', bought: '3.2.2026.', env: 'PRODUCTION' },
    });
    expect(result.issues).toEqual([]);
    expect(result.attributes).toEqual({ ramGb: 15.5, color: true, bought: '2026-02-03', env: 'production' });
  });

  it('reports each problem by key and requires required values on create', () => {
    const result = validateAssetAttributes({
      definitions,
      values: { color: 'maybe', bought: '2026-02-30', env: 'staging', old: 'x', nope: 1 },
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { key: 'color', problem: 'boolean' },
        { key: 'bought', problem: 'date' },
        { key: 'env', problem: 'option' },
        { key: 'old', problem: 'unknown' },
        { key: 'nope', problem: 'unknown' },
        { key: 'ramGb', problem: 'required' },
      ]),
    );
  });

  it('partial update keeps current values, clears on empty and skips required when not given', () => {
    const result = validateAssetAttributes({
      definitions,
      values: { color: '' },
      current: { ramGb: 8, color: true, old: 'kept' },
      partial: true,
    });
    expect(result.issues).toEqual([]);
    expect(result.attributes).toEqual({ ramGb: 8, old: 'kept' });
  });

  it('treats blank as empty and rejects over-long text', () => {
    expect(parseAttributeValue(definition({ key: 'a' }), '   ')).toEqual({ value: undefined });
    expect(parseAttributeValue(definition({ key: 'a' }), 'x'.repeat(501))).toEqual({ issue: 'text_too_long' });
  });
});

describe('asset status transitions (§5)', () => {
  it('disposed is final and only reachable from retired', () => {
    for (const status of assetStatuses) {
      if (status !== 'DISPOSED') expect(canTransitionAssetStatus('DISPOSED', status)).toBe(false);
      expect(canTransitionAssetStatus(status, 'DISPOSED')).toBe(status === 'RETIRED' || status === 'DISPOSED');
    }
  });

  it('a lost item can be found and in-use items can go to repair', () => {
    expect(canTransitionAssetStatus('LOST', 'IN_STOCK')).toBe(true);
    expect(canTransitionAssetStatus('IN_USE', 'IN_REPAIR')).toBe(true);
    expect(canTransitionAssetStatus('ORDERED', 'IN_REPAIR')).toBe(false);
  });
});

describe('asset relations (§6)', () => {
  const edges: RelationEdge[] = [
    { fromAssetId: 'app', toAssetId: 'vm', kind: 'RUNS_ON' },
    { fromAssetId: 'vm', toAssetId: 'server', kind: 'RUNS_ON' },
    { fromAssetId: 'server', toAssetId: 'switch', kind: 'CONNECTED_TO' },
  ];
  const load = async (ids: readonly string[], direction: 'out' | 'in') =>
    edges.filter((edge) => ids.includes(direction === 'out' ? edge.fromAssetId : edge.toAssetId));

  it('detects a cycle through directed edges only', async () => {
    await expect(wouldCreateRelationCycle('server', 'app', load)).resolves.toBe(true);
    await expect(wouldCreateRelationCycle('switch', 'app', load)).resolves.toBe(false);
    await expect(wouldCreateRelationCycle('a', 'a', load)).resolves.toBe(true);
  });

  it('collects dependents and dependencies with depth, ignoring symmetric links', async () => {
    const dependents = await collectRelationImpact('server', 'in', load);
    expect(dependents.map((node) => [node.assetId, node.depth])).toEqual([
      ['vm', 1],
      ['app', 2],
    ]);
    const dependencies = await collectRelationImpact('app', 'out', load);
    expect(dependencies.map((node) => node.assetId)).toEqual(['vm', 'server']);
  });
});

describe('asset viewer scope (§14)', () => {
  function context(assignments: PrincipalContext['assignments'], roleKeys: string[] = []): PrincipalContext {
    return {
      subjectId: 'u1',
      email: 'a@example.com',
      displayName: 'A',
      isActive: true,
      isLocalOnly: false,
      mustChangePassword: false,
      entraObjectId: null,
      roleKeys,
      groupIds: [],
      homeOrganizationalUnitId: 'ou-home',
      assignments,
      authzVersion: 1,
    };
  }

  it('ADMIN covers every unit; an unscoped AGENT grant covers the home unit and sub-units', () => {
    const admin = assetViewerFromContext(
      context([{ roleKey: 'ADMIN', permissionKeys: ['asset.read'], organizationalUnitId: null, organizationalUnitPath: null, serviceId: null }]),
      'u1',
    );
    expect(resolveAssetScope(admin, 'asset.read', null)).toEqual({ all: true });
    const agent = assetViewerFromContext(
      context([{ roleKey: 'AGENT', permissionKeys: ['asset.read', 'ticket.merge'], organizationalUnitId: null, organizationalUnitPath: null, serviceId: null }]),
      'u1',
    );
    const scope = resolveAssetScope(agent, 'asset.read', 'Org/Sarajevo');
    expect(isPathInScope(scope, 'Org/Sarajevo/IT')).toBe(true);
    expect(isPathInScope(scope, 'Org/Sarajevo2')).toBe(false);
    expect(resolveAssetScope(agent, 'asset.import', 'Org/Sarajevo')).toEqual({ all: false, paths: [] });
    expect(agent.grants.map((grant) => grant.permission)).toEqual(['asset.read']);
  });

  it('a scoped ASSET_MANAGER grant uses its unit; an empty scope matches nothing', () => {
    const manager = assetViewerFromContext(
      context([
        { roleKey: 'ASSET_MANAGER', permissionKeys: ['asset.manage'], organizationalUnitId: 'ou1', organizationalUnitPath: 'Org/Mostar', serviceId: null },
      ]),
      'u1',
    );
    expect(resolveAssetScope(manager, 'asset.manage', 'Org/Sarajevo')).toEqual({ all: false, paths: ['Org/Mostar'] });
    expect(unitScopeWhere({ all: false, paths: [] })).toEqual({ ouPath: '\u0000no-scope' });
    expect(unitScopeWhere({ all: true })).toBeNull();
  });
});

describe('asset settings parsing (§15)', () => {
  it('parses reminder days and user-match lists', () => {
    expect(parseReminderDays('7, 60,30,60')).toEqual([60, 30, 7]);
    expect(parseReminderDays('0,30')).toBeNull();
    expect(parseReminderDays('')).toBeNull();
    expect(parseUserMatch('managedBy,description')).toEqual(['managedBy', 'description']);
    expect(parseUserMatch('managedBy,guess')).toBeNull();
  });

  it('requires a named login group in the computer-name pattern', () => {
    expect(() => assertNamePattern('')).not.toThrow();
    expect(() => assertNamePattern('^PC-(?<login>[a-z.]+)$')).not.toThrow();
    expect(() => assertNamePattern('^PC-(.+)$')).toThrow();
    expect(() => assertNamePattern('([')).toThrow();
  });
});

describe('asset history diff (§16)', () => {
  it('lists changed fields and attributes only', () => {
    const changes = diffAsset(
      { name: 'A', warrantyEndsAt: new Date('2026-01-01T00:00:00Z'), attributes: { ramGb: 8 }, notes: null },
      { name: 'B', warrantyEndsAt: new Date('2026-01-01T00:00:00Z'), attributes: { ramGb: 16, os: 'Win' }, notes: null },
    );
    expect(changes).toEqual({ name: ['A', 'B'], 'attributes.ramGb': ['8', '16'], 'attributes.os': [null, 'Win'] });
  });
});
