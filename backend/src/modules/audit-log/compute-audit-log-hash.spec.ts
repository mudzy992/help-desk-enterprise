import { canonicalizeJson } from '../change-log/canonicalize-json';
import { createHash } from 'node:crypto';
import { auditLogGenesisHash } from './audit-log.constants';
import { computeAuditLogHash } from './compute-audit-log-hash';

describe('computeAuditLogHash', () => {
  it('matches the config-versioning sha256(previousHash + newline + canonical JSON) algorithm', () => {
    const previousHash = auditLogGenesisHash;
    const payload = {
      action: 'config_version.activate',
      entityType: 'config_version',
      entityId: 'version-1',
      metadata: { reason: 'go', version: 1 },
      actorUserId: 'user-1',
      previousHash,
    };
    const expected = createHash('sha256')
      .update(previousHash)
      .update('\n')
      .update(JSON.stringify(canonicalizeJson(payload)))
      .digest('hex');
    expect(
      computeAuditLogHash({
        previousHash,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        metadata: payload.metadata,
        actorUserId: payload.actorUserId,
      }),
    ).toBe(expected);
  });

  it('is stable for the same input and changes when metadata is tampered', () => {
    const input = {
      previousHash: auditLogGenesisHash,
      action: 'ticket_bulk.execute',
      entityType: 'ticket_bulk',
      entityId: 'batch-1',
      metadata: { actionType: 'assign_group' },
      actorUserId: 'admin-1',
      organizationalUnitId: 'ou-it',
    };
    const first = computeAuditLogHash(input);
    expect(computeAuditLogHash(input)).toBe(first);
    expect(
      computeAuditLogHash({
        ...input,
        metadata: { actionType: 'set_status' },
      }),
    ).not.toBe(first);
  });
});
