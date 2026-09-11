import { resolveMatchingSlaRule } from './resolve-matching-sla-rule';
import type { SlaRuleRecord } from './sla.types';

const now = new Date('2026-09-11T08:00:00.000Z');

function rule(
  partial: Pick<
    SlaRuleRecord,
    'id' | 'evaluationOrder' | 'serviceId' | 'organizationalUnitId'
  >,
): SlaRuleRecord {
  return {
    slaProfileId: 'profile-1',
    priority: 'HIGH',
    responseMinutes: 60,
    resolutionMinutes: 240,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('resolveMatchingSlaRule', () => {
  it('prefers lower evaluationOrder, then more specific match keys', () => {
    const selected = resolveMatchingSlaRule(
      [
        rule({
          id: 'generic',
          evaluationOrder: 10,
          serviceId: null,
          organizationalUnitId: null,
        }),
        rule({
          id: 'service',
          evaluationOrder: 10,
          serviceId: 'service-vpn',
          organizationalUnitId: null,
        }),
        rule({
          id: 'later',
          evaluationOrder: 20,
          serviceId: 'service-vpn',
          organizationalUnitId: 'ou-it',
        }),
      ],
      { priority: 'HIGH', serviceId: 'service-vpn', organizationalUnitId: 'ou-it' },
    );
    expect(selected?.id).toBe('service');
  });
});
