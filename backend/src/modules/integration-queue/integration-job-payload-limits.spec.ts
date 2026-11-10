import { IntegrationJobType } from '../../generated/prisma/enums';
import {
  assertIntegrationJobPayloadWithinLimits,
  integrationJobPayloadByteLimits,
  integrationJobPayloadMaxDepth,
  integrationJobPayloadMaxNodes,
  IntegrationJobPayloadLimitError,
} from './integration-job-payload-limits';

describe('integration job payload resource limits', () => {
  it.each([IntegrationJobType.EMAIL, IntegrationJobType.EDGE_EVENT, IntegrationJobType.TEAMS])('accepts ordinary %s JSON and rejects an oversized string', (type) => {
    expect(() => assertIntegrationJobPayloadWithinLimits(type, { userId: 'u', data: ['hello', { ok: true }] })).not.toThrow();
    expect(() => assertIntegrationJobPayloadWithinLimits(type, { text: 'x'.repeat(integrationJobPayloadByteLimits[type]) })).toThrow(IntegrationJobPayloadLimitError);
  });

  it('accepts an exact byte budget and a root-to-leaf depth of 16', () => {
    const max = integrationJobPayloadByteLimits[IntegrationJobType.TEAMS];
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.TEAMS, 'x'.repeat(max - 2))).not.toThrow();
    let value: unknown = 'end';
    for (let i = 0; i < integrationJobPayloadMaxDepth; i++) value = { child: value };
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.TEAMS, value)).not.toThrow();
  });

  it('counts UTF-8 bytes, object keys and total nodes', () => {
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.TEAMS, { text: '€'.repeat(22_000) })).toThrow(IntegrationJobPayloadLimitError);
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.TEAMS, { ['k'.repeat(65_536)]: 1 })).toThrow(IntegrationJobPayloadLimitError);
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.EMAIL, Array(integrationJobPayloadMaxNodes).fill(1))).toThrow(IntegrationJobPayloadLimitError);
  });

  it('enforces depth without recursion and rejects cyclic input', () => {
    let value: unknown = 'end';
    for (let i = 0; i <= integrationJobPayloadMaxDepth; i++) value = { child: value };
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.EDGE_EVENT, value)).toThrow(IntegrationJobPayloadLimitError);
    const cyclic: { child?: unknown } = {};
    cyclic.child = cyclic;
    expect(() => assertIntegrationJobPayloadWithinLimits(IntegrationJobType.TEAMS, cyclic)).toThrow(IntegrationJobPayloadLimitError);
  });
});
