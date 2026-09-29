import {
  assertEscalationLevelAllowed,
  normalizeEscalationTarget,
} from './assert-sla-escalation-constraints';
import { SlaError } from './sla.error';
import { createInMemorySlaEscalationRuleDelegate } from './in-memory-sla-escalation-rule-delegate';
import type { SlaEscalationRuleRecord } from './ticket-sla.types';

describe('SLA escalation constraints', () => {
  it('requires exactly one target', () => {
    expect(() =>
      normalizeEscalationTarget({
        targetGroupId: 'g1',
        targetRole: 'admin',
      }),
    ).toThrow(new SlaError('INVALID_ESCALATION_TARGET'));
    expect(
      normalizeEscalationTarget({ targetUserId: 'u1' }),
    ).toEqual({
      targetGroupId: null,
      targetRole: null,
      targetUserId: 'u1',
      targetOnCall: false,
    });
    // Paket 2.9 (K3): the on-call target needs a group.
    expect(() => normalizeEscalationTarget({ targetUserId: 'u1', targetOnCall: true })).toThrow(
      new SlaError('INVALID_ESCALATION_TARGET'),
    );
    expect(normalizeEscalationTarget({ targetGroupId: 'g1', targetOnCall: true }).targetOnCall).toBe(true);
  });

  it('blocks levels above maxEscalationLevels', async () => {
    const rules = new Map<string, SlaEscalationRuleRecord>();
    const delegate = createInMemorySlaEscalationRuleDelegate(
      rules,
      (prefix) => `${prefix}-1`,
    );
    await delegate.create({
      data: {
        slaProfileId: 'profile-1',
        triggerOffsetMinutes: 0,
        targetGroupId: 'group-1',
      },
    });
    const prisma = { slaEscalationRule: delegate } as never;
    await expect(
      assertEscalationLevelAllowed(prisma, {
        slaProfileId: 'profile-1',
        maxEscalationLevels: 1,
      }),
    ).rejects.toEqual(new SlaError('MAX_ESCALATION_LEVELS_EXCEEDED'));
  });
});
