import { getRequestId } from '../../common/request-context/request-context.storage';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import type { RecordAuditEntryInput } from './audit-log.types';

const actionRegistry = new Set<string>(Object.values(auditLogActions));
const entityTypeRegistry = new Set<string>(Object.values(auditLogEntityTypes));
const sensitiveKey = /(?:password|passwd|secret|token|authorization|cookie|private.?key|credential|recovery.?code)/i;
export const auditMetadataMaxBytes = 16 * 1024;
export const auditMetadataMaxDepth = 8;
export const auditRedactedValue = '[REDACTED]';

export type AuditActorClass = 'human' | 'system';

function redact(value: unknown, depth: number): unknown {
  if (depth > auditMetadataMaxDepth) throw new Error('AUDIT_METADATA_DEPTH_EXCEEDED');
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? auditRedactedValue : redact(item, depth + 1),
    ]));
  }
  return value;
}

export function prepareAuditEntry(input: RecordAuditEntryInput): RecordAuditEntryInput {
  if (!actionRegistry.has(input.action)) throw new Error(`AUDIT_ACTION_NOT_REGISTERED:${input.action}`);
  if (!entityTypeRegistry.has(input.entityType)) throw new Error(`AUDIT_ENTITY_TYPE_NOT_REGISTERED:${input.entityType}`);
  const metadata = redact(input.metadata, 0) as RecordAuditEntryInput['metadata'];
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > auditMetadataMaxBytes) {
    throw new Error('AUDIT_METADATA_SIZE_EXCEEDED');
  }
  return { ...input, metadata, requestId: input.requestId ?? getRequestId() ?? null };
}

export function classifyAuditActor(actorUserId: string | null): AuditActorClass {
  return actorUserId === null ? 'system' : 'human';
}

export function getAuditRegistryInventory() {
  return Object.freeze({
    actions: Object.freeze([...actionRegistry].sort()),
    entityTypes: Object.freeze([...entityTypeRegistry].sort()),
    actorClasses: Object.freeze<AuditActorClass[]>(['human', 'system']),
  });
}
