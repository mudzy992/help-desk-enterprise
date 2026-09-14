import type { JsonValue } from '../change-log/change-log.types';

export function buildCanonicalAuditPayload(input: {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: JsonValue;
  readonly actorUserId: string | null;
  readonly previousHash: string;
  readonly requestId?: string | null;
  readonly organizationalUnitId?: string | null;
}): JsonValue {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    entityId: input.entityId,
    entityType: input.entityType,
    metadata: input.metadata,
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
