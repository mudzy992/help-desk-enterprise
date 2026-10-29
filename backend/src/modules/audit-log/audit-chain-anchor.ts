import { createHmac, timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type AuditChainAnchor = {
  readonly version: 1;
  readonly chainHeadId: string;
  readonly chainHeadHash: string;
  readonly chainHeadCreatedAt: string;
  readonly anchoredAt: string;
  readonly keyId: string;
  readonly signature: string;
};

export type AuditAnchorVerification =
  | { readonly valid: true; readonly lagMs: number }
  | { readonly valid: false; readonly reason: 'MISSING' | 'INVALID_SIGNATURE' | 'HEAD_MISMATCH' | 'STALE'; readonly lagMs?: number };

type UnsignedAnchor = Omit<AuditChainAnchor, 'signature'>;

function payload(anchor: UnsignedAnchor): string {
  return JSON.stringify({
    version: anchor.version,
    chainHeadId: anchor.chainHeadId,
    chainHeadHash: anchor.chainHeadHash,
    chainHeadCreatedAt: anchor.chainHeadCreatedAt,
    anchoredAt: anchor.anchoredAt,
    keyId: anchor.keyId,
  });
}

function signature(anchor: UnsignedAnchor, key: string): string {
  if (Buffer.byteLength(key, 'utf8') < 32) throw new Error('AUDIT_ANCHOR_KEY_TOO_SHORT');
  return createHmac('sha256', key).update(payload(anchor)).digest('hex');
}

export function createAuditChainAnchor(input: {
  readonly key: string;
  readonly keyId: string;
  readonly chainHead: { readonly id: string; readonly hash: string; readonly createdAt: Date };
  readonly now?: Date;
}): AuditChainAnchor {
  const unsigned: UnsignedAnchor = {
    version: 1,
    chainHeadId: input.chainHead.id,
    chainHeadHash: input.chainHead.hash,
    chainHeadCreatedAt: input.chainHead.createdAt.toISOString(),
    anchoredAt: (input.now ?? new Date()).toISOString(),
    keyId: input.keyId,
  };
  return { ...unsigned, signature: signature(unsigned, input.key) };
}

export async function publishAuditChainAnchor(input: {
  readonly filePath: string;
  readonly key: string;
  readonly keyId: string;
  readonly chainHead: { readonly id: string; readonly hash: string; readonly createdAt: Date };
  readonly now?: Date;
}): Promise<AuditChainAnchor> {
  const anchor = createAuditChainAnchor(input);
  await mkdir(path.dirname(input.filePath), { recursive: true });
  const temporary = `${input.filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(anchor)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, input.filePath);
  return anchor;
}

export async function verifyAuditChainAnchor(input: {
  readonly filePath: string;
  readonly keys: Readonly<Record<string, string>>;
  readonly expectedHead: { readonly id: string; readonly hash: string };
  readonly maxLagMs: number;
  readonly now?: Date;
}): Promise<AuditAnchorVerification> {
  let anchor: AuditChainAnchor;
  try {
    anchor = JSON.parse(await readFile(input.filePath, 'utf8')) as AuditChainAnchor;
  } catch {
    return { valid: false, reason: 'MISSING' };
  }
  const key = input.keys[anchor.keyId];
  if (key === undefined) return { valid: false, reason: 'INVALID_SIGNATURE' };
  const { signature: actual, ...unsigned } = anchor;
  const expected = signature(unsigned, key);
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
  if (anchor.chainHeadId !== input.expectedHead.id || anchor.chainHeadHash !== input.expectedHead.hash) {
    return { valid: false, reason: 'HEAD_MISMATCH' };
  }
  const lagMs = (input.now ?? new Date()).getTime() - Date.parse(anchor.anchoredAt);
  if (!Number.isFinite(lagMs) || lagMs < 0 || lagMs > input.maxLagMs) {
    return { valid: false, reason: 'STALE', lagMs };
  }
  return { valid: true, lagMs };
}
