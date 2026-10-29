import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishAuditChainAnchor, verifyAuditChainAnchor } from './audit-chain-anchor';

describe('external signed audit chain anchor', () => {
  const key = 'a'.repeat(32);
  const now = new Date('2026-10-24T12:00:00.000Z');
  const head = { id: 'row-1', hash: 'f'.repeat(64), createdAt: now };

  it('publishes outside the database and verifies signature, head and lag', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'audit-anchor-'));
    const filePath = path.join(directory, 'anchor.json');
    await publishAuditChainAnchor({ filePath, key, keyId: 'key-2026-10', chainHead: head, now });
    await expect(verifyAuditChainAnchor({
      filePath,
      keys: { 'key-2026-10': key },
      expectedHead: head,
      maxLagMs: 60_000,
      now: new Date(now.getTime() + 30_000),
    })).resolves.toEqual({ valid: true, lagMs: 30_000 });
  });

  it('fails closed for DB-only head rewrite, tampering and anchor lag', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'audit-anchor-'));
    const filePath = path.join(directory, 'anchor.json');
    await publishAuditChainAnchor({ filePath, key, keyId: 'key-2026-10', chainHead: head, now });
    await expect(verifyAuditChainAnchor({ filePath, keys: { 'key-2026-10': key }, expectedHead: { ...head, hash: '0'.repeat(64) }, maxLagMs: 60_000, now })).resolves.toMatchObject({ valid: false, reason: 'HEAD_MISMATCH' });
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    await writeFile(filePath, JSON.stringify({ ...parsed, chainHeadHash: '1'.repeat(64) }));
    await expect(verifyAuditChainAnchor({ filePath, keys: { 'key-2026-10': key }, expectedHead: head, maxLagMs: 60_000, now })).resolves.toMatchObject({ valid: false, reason: 'INVALID_SIGNATURE' });
    await publishAuditChainAnchor({ filePath, key, keyId: 'key-2026-10', chainHead: head, now });
    await expect(verifyAuditChainAnchor({ filePath, keys: { 'key-2026-10': key }, expectedHead: head, maxLagMs: 60_000, now: new Date(now.getTime() + 60_001) })).resolves.toMatchObject({ valid: false, reason: 'STALE' });
  });
});
