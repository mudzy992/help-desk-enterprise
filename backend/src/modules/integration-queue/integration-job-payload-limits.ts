import { IntegrationJobType } from '../../generated/prisma/enums';

/** Limits apply to already-loaded JSON; byte accounting is a conservative budget, not JSON byte length. */
export const integrationJobPayloadByteLimits: Readonly<Record<IntegrationJobType, number>> = {
  [IntegrationJobType.EMAIL]: 2 * 1024 * 1024,
  [IntegrationJobType.EDGE_EVENT]: 256 * 1024,
  [IntegrationJobType.TEAMS]: 64 * 1024,
};
export const integrationJobPayloadMaxDepth = 16;
export const integrationJobPayloadMaxNodes = 10_000;

export class IntegrationJobPayloadLimitError extends Error {
  constructor() {
    super('INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED');
    this.name = 'IntegrationJobPayloadLimitError';
  }
}

/** Iterative traversal avoids recursion and bounds work before type parsers and providers run. */
export function assertIntegrationJobPayloadWithinLimits(type: IntegrationJobType, payload: unknown): void {
  const maxBytes = integrationJobPayloadByteLimits[type];
  if (maxBytes === undefined) throw new IntegrationJobPayloadLimitError();
  const pending: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
  const seen = new WeakSet<object>();
  let bytes = 0;
  let nodes = 0;
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (++nodes > integrationJobPayloadMaxNodes || depth > integrationJobPayloadMaxDepth) throw new IntegrationJobPayloadLimitError();
    if (typeof value === 'string') {
      if (value.length > maxBytes) throw new IntegrationJobPayloadLimitError();
      bytes += Buffer.byteLength(value, 'utf8') + 2;
    } else if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) throw new IntegrationJobPayloadLimitError();
      seen.add(value);
      const entries = Object.keys(value);
      if (entries.length > integrationJobPayloadMaxNodes - nodes - pending.length) throw new IntegrationJobPayloadLimitError();
      bytes += 2 + entries.length;
      for (const key of entries) {
        if (key.length > maxBytes) throw new IntegrationJobPayloadLimitError();
        bytes += Buffer.byteLength(key, 'utf8') + 3;
        if (bytes > maxBytes) throw new IntegrationJobPayloadLimitError();
        pending.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 });
      }
    } else {
      bytes += 16;
    }
    if (bytes > maxBytes) throw new IntegrationJobPayloadLimitError();
  }
}
