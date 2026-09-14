import { createHash } from 'node:crypto';
import { canonicalizeJson } from '../change-log/canonicalize-json';
import type { JsonValue } from '../change-log/change-log.types';
import {
  allowedAuditHashAlgorithms,
  defaultAuditHashAlgorithm,
} from './audit-log.constants';
import { AuditLogError, auditLogErrorCodes } from './audit-log.error';
import { buildCanonicalAuditPayload } from './build-canonical-audit-payload';
import type { AuditHashAlgorithm } from './audit-log.types';

export function computeAuditLogHash(input: {
  readonly previousHash: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: JsonValue;
  readonly actorUserId: string | null;
  readonly requestId?: string | null;
  readonly organizationalUnitId?: string | null;
  readonly hashAlgorithm?: AuditHashAlgorithm;
}): string {
  const hashAlgorithm = resolveAuditHashAlgorithm(input.hashAlgorithm);
  const canonical = canonicalizeJson(buildCanonicalAuditPayload(input));
  return createHash(hashAlgorithm)
    .update(input.previousHash)
    .update('\n')
    .update(JSON.stringify(canonical))
    .digest('hex');
}

export function resolveAuditHashAlgorithm(
  value: string | undefined,
): AuditHashAlgorithm {
  const algorithm = value ?? defaultAuditHashAlgorithm;
  if (
    !allowedAuditHashAlgorithms.includes(algorithm as AuditHashAlgorithm)
  ) {
    throw new AuditLogError(auditLogErrorCodes.hashAlgorithmUnsupported);
  }
  return algorithm as AuditHashAlgorithm;
}
