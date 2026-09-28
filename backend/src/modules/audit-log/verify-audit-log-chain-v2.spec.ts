import { auditLogGenesisHash } from './audit-log.constants';
import { auditHashVersions } from './build-canonical-audit-payload';
import { computeAuditLogHash, computeAuditMetadataDigest } from './compute-audit-log-hash';
import type { AuditLogRecord } from './audit-log.types';
import { verifyAuditLogChain } from './verify-audit-log-chain';
import type { JsonValue } from '../change-log/change-log.types';

type Draft = { readonly metadata: JsonValue; readonly version: 1 | 2 };

function buildChain(drafts: readonly Draft[], startHash = auditLogGenesisHash): AuditLogRecord[] {
  const records: AuditLogRecord[] = [];
  let previousHash = startHash;
  drafts.forEach((draft, index) => {
    const base = {
      action: 'user.login_failed',
      entityType: 'user',
      entityId: `u-${index}`,
      actorUserId: null,
      requestId: null,
      organizationalUnitId: null,
    };
    const metadataDigest =
      draft.version === 2 ? computeAuditMetadataDigest(draft.metadata) : null;
    const hash = computeAuditLogHash({
      ...base,
      previousHash,
      metadata: draft.metadata,
      hashAlgorithm: 'sha256',
      ...(draft.version === 2
        ? { hashVersion: auditHashVersions.v2, metadataDigest }
        : {}),
    });
    records.push({
      ...base,
      id: `a-${String(index).padStart(3, '0')}`,
      metadata: draft.metadata,
      previousHash,
      hash,
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)),
      hashVersion: draft.version,
      metadataDigest,
      redactedAt: null,
    });
    previousHash = hash;
  });
  return records;
}

const verify = (records: readonly AuditLogRecord[], start?: Parameters<typeof verifyAuditLogChain>[0]['start']) =>
  verifyAuditLogChain({ records, hashAlgorithm: 'sha256', start });

describe('verifyAuditLogChain (paket 2.6: v2, redaction, checkpoints)', () => {
  const mixed: Draft[] = [
    { metadata: { email: 'amra@epbih.ba' }, version: 1 },
    { metadata: { email: 'amra@epbih.ba', reason: 'bad_password' }, version: 1 },
    { metadata: { email: 'amra@epbih.ba' }, version: 2 },
    { metadata: { recordCount: 3 }, version: 2 },
  ];

  it('accepts a chain that mixes legacy v1 and v2 rows', () => {
    expect(verify(buildChain(mixed))).toMatchObject({
      valid: true,
      checkedCount: 4,
      redactedCount: 0,
      sealedCount: 0,
    });
  });

  it('detects a silent metadata rewrite of a v2 row', () => {
    const records = buildChain(mixed);
    records[2] = { ...records[2]!, metadata: { email: 'someone@else.ba' } };
    expect(verify(records)).toMatchObject({ valid: false, firstMismatchIndex: 2 });
  });

  it('keeps a redacted v2 row fully verifiable (hash commits to the digest)', () => {
    const records = buildChain(mixed);
    records[2] = {
      ...records[2]!,
      metadata: { email: 'anon-7f3a@anonymized.invalid' },
      redactedAt: new Date(),
    };
    expect(verify(records)).toMatchObject({ valid: true, redactedCount: 1, sealedCount: 0 });
  });

  it('still detects a forged digest on a redacted v2 row', () => {
    const records = buildChain(mixed);
    records[2] = { ...records[2]!, metadataDigest: 'f'.repeat(64), redactedAt: new Date() };
    expect(verify(records)).toMatchObject({ valid: false, firstMismatchIndex: 2 });
  });

  it('seals a redacted v1 row: the link is checked, the content is not', () => {
    const records = buildChain(mixed);
    records[1] = { ...records[1]!, metadata: { email: '[redacted]' }, redactedAt: new Date() };
    expect(verify(records)).toMatchObject({ valid: true, redactedCount: 1, sealedCount: 1 });
  });

  it('rejects a v1 content change that is not marked as redacted', () => {
    const records = buildChain(mixed);
    records[1] = { ...records[1]!, metadata: { email: '[redacted]' } };
    expect(verify(records)).toMatchObject({ valid: false, firstMismatchIndex: 1 });
  });

  it('breaks on a removed row in the middle (link check)', () => {
    const records = buildChain(mixed);
    records.splice(1, 1);
    expect(verify(records)).toMatchObject({ valid: false, firstMismatchIndex: 1 });
  });

  it('starts from the latest checkpoint after the oldest rows were purged', () => {
    const records = buildChain(mixed);
    const purged = records.splice(0, 2);
    expect(verify(records)).toMatchObject({ valid: false, firstMismatchIndex: 0 });
    const start = {
      throughHash: purged[1]!.hash,
      throughCreatedAt: purged[1]!.createdAt,
      purgedCount: 2,
    };
    expect(verify(records, start)).toMatchObject({
      valid: true,
      checkedCount: 2,
      checkpoint: { purgedCount: 2, throughHash: purged[1]!.hash },
    });
  });
});
