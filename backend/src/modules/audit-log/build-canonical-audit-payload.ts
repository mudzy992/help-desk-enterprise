import type { JsonValue } from '../change-log/change-log.types';

/**
 * Paket 2.6 (§6.5): version 1 hashes the metadata itself; version 2 hashes the
 * SHA-256 digest of the canonical metadata. With v2 the metadata can later be
 * redacted (anonymization) while the chain stays fully verifiable.
 */
export const auditHashVersions = { v1: 1, v2: 2 } as const;
export type AuditHashVersion = (typeof auditHashVersions)[keyof typeof auditHashVersions];

export function buildCanonicalAuditPayload(input: {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: JsonValue;
  readonly actorUserId: string | null;
  readonly previousHash: string;
  readonly requestId?: string | null;
  readonly organizationalUnitId?: string | null;
  readonly hashVersion?: AuditHashVersion;
  readonly metadataDigest?: string | null;
}): JsonValue {
  const content: Record<string, JsonValue> =
    input.hashVersion === auditHashVersions.v2
      ? { hashVersion: auditHashVersions.v2, metadataDigest: input.metadataDigest ?? '' }
      : { metadata: input.metadata };
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    entityId: input.entityId,
    entityType: input.entityType,
    ...content,
    previousHash: input.previousHash,
    ...(isPresent(input.requestId) ? { requestId: input.requestId } : {}),
    ...(isPresent(input.organizationalUnitId)
      ? { organizationalUnitId: input.organizationalUnitId }
      : {}),
  };
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
