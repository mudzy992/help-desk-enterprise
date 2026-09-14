import { createConfigSnapshotFixture } from './create-config-snapshot-fixture';
import { computeShadowDiff } from './compute-shadow-diff';

describe('computeShadowDiff', () => {
  it('counts routing and SLA mismatches without mutating snapshots', () => {
    const active = createConfigSnapshotFixture();
    const candidate = createConfigSnapshotFixture({
      routing: {
        ...active.routing,
        rules: [
          {
            id: 'rule-1',
            originUnitId: 'ou-root',
            serviceId: 'service-vpn',
            groupId: 'group-other',
          },
        ],
      },
      sla: {
        ...active.sla,
        rules: active.sla.rules.map((rule) =>
          rule.priority === 'HIGH'
            ? { ...rule, id: 'rule-HIGH-new', responseMinutes: 10 }
            : rule,
        ),
      },
    });
    const frozenActive = JSON.stringify(active);
    const frozenCandidate = JSON.stringify(candidate);
    const diff = computeShadowDiff(active, candidate, [
      { originUnitId: 'ou-root', serviceId: 'service-vpn', priority: 'HIGH' },
      { originUnitId: 'ou-root', serviceId: 'service-vpn', priority: 'LOW' },
    ]);
    expect(diff.sampleSize).toBe(2);
    expect(diff.routingGroupMismatches).toBe(2);
    expect(diff.slaRuleMismatches).toBe(1);
    expect(JSON.stringify(active)).toBe(frozenActive);
    expect(JSON.stringify(candidate)).toBe(frozenCandidate);
  });
});
