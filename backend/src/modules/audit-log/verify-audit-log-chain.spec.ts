import { auditLogGenesisHash } from './audit-log.constants';
import { computeAuditLogHash } from './compute-audit-log-hash';
import type { AuditLogRecord } from './audit-log.types';
import { verifyAuditLogChain } from './verify-audit-log-chain';

describe('verifyAuditLogChain', () => {
  it('accepts a two-entry chain and reports the first tampered record', () => {
    const first = createRecord({
      id: 'a',
      previousHash: auditLogGenesisHash,
      createdAt: new Date('2026-09-14T10:00:00.000Z'),
    });
    const second = createRecord({
      id: 'b',
      previousHash: first.hash,
      createdAt: new Date('2026-09-14T10:01:00.000Z'),
      entityId: 'ticket-2',
    });
    expect(
      verifyAuditLogChain({
        records: [second, first],
        hashAlgorithm: 'sha256',
      }),
    ).toEqual({ enabled: true, valid: true, checkedCount: 2 });
    const tampered: AuditLogRecord = {
      ...second,
      metadata: { result: 'forged' },
    };
    expect(
      verifyAuditLogChain({
        records: [first, tampered],
        hashAlgorithm: 'sha256',
      }),
    ).toEqual({
      enabled: true,
      valid: false,
      checkedCount: 2,
      firstMismatchId: 'b',
      firstMismatchIndex: 1,
    });
  });
});

function createRecord(input: {
  readonly id: string;
  readonly previousHash: string;
  readonly createdAt: Date;
  readonly entityId?: string;
}): AuditLogRecord {
  const base = {
    action: 'ticket_confidential_viewed',
    entityType: 'ticket',
    entityId: input.entityId ?? 'ticket-1',
    metadata: { result: 'allowed' },
    actorUserId: 'agent-1',
    requestId: null,
    organizationalUnitId: 'ou-it',
  };
  return {
    id: input.id,
    ...base,
    previousHash: input.previousHash,
    hash: computeAuditLogHash({
      previousHash: input.previousHash,
      ...base,
    }),
    createdAt: input.createdAt,
  };
}
