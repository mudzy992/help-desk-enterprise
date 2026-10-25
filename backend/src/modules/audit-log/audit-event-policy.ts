import { getRequestId } from '../../common/request-context/request-context.storage';
import { getAuditActionSchema } from './audit-action-schema-registry';
import { getAuditScopePolicy } from './audit-action-scope-registry';
import { auditLogActions, auditLogEntityTypes } from './audit-log.constants';
import type { RecordAuditEntryInput } from './audit-log.types';

const actionRegistry = new Set<string>(Object.values(auditLogActions));
const entityTypeRegistry = new Set<string>(Object.values(auditLogEntityTypes));
const secretKey = /(?:password|passwd|secret|token|authorization|cookie|private.?key|credential|recovery.?code)/i;
const directIdentifierKey = /^(?:e-?mail|displayName|firstName|lastName|phone|phoneNumber|ip|ipAddress|address)$/i;
export const auditMetadataMaxBytes = 16 * 1024;
export const auditMetadataMaxDepth = 8;
export const auditMetadataMaxKeys = 128;
export const auditRedactedValue = '[REDACTED]';
export const auditPseudonymizedValue = '[PSEUDONYMIZED]';

export type AuditActorClass = 'human' | 'system';
export type PreparedAuditEntry = RecordAuditEntryInput & { readonly actionSchemaVersion: number };

type SanitizeState = { keys: number };

function sanitize(value: unknown, depth: number, state: SanitizeState): unknown {
  if (depth > auditMetadataMaxDepth) throw new Error('AUDIT_METADATA_DEPTH_EXCEEDED');
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1, state));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      state.keys += 1;
      if (state.keys > auditMetadataMaxKeys) throw new Error('AUDIT_METADATA_KEY_COUNT_EXCEEDED');
      if (secretKey.test(key)) return [key, auditRedactedValue];
      if (directIdentifierKey.test(key)) return [key, auditPseudonymizedValue];
      return [key, sanitize(item, depth + 1, state)];
    }));
  }
  return value;
}

export function prepareAuditEntry(input: RecordAuditEntryInput): PreparedAuditEntry {
  const actionSchema = getAuditActionSchema(input.action);
  const scopePolicy = getAuditScopePolicy(input.action);
  if (!actionRegistry.has(input.action) || actionSchema === undefined || scopePolicy === undefined) {
    throw new Error(`AUDIT_ACTION_NOT_REGISTERED:${input.action}`);
  }
  if (!entityTypeRegistry.has(input.entityType)) throw new Error(`AUDIT_ENTITY_TYPE_NOT_REGISTERED:${input.entityType}`);
  if (scopePolicy === 'global' && input.organizationalUnitId != null) {
    throw new Error(`AUDIT_SCOPE_MUST_BE_GLOBAL:${input.action}`);
  }
  if (scopePolicy === 'entity' && input.organizationalUnitId == null) {
    throw new Error(`AUDIT_SCOPE_REQUIRED:${input.action}`);
  }
  if (input.metadata === null || typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
    throw new Error('AUDIT_METADATA_OBJECT_REQUIRED');
  }
  for (const key of Object.keys(input.metadata)) {
    if (!actionSchema.allowedKeys.has(key)) throw new Error(`AUDIT_METADATA_FIELD_NOT_ALLOWED:${input.action}:${key}`);
  }
  const metadata = sanitize(input.metadata, 0, { keys: 0 }) as RecordAuditEntryInput['metadata'];
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > auditMetadataMaxBytes) {
    throw new Error('AUDIT_METADATA_SIZE_EXCEEDED');
  }
  return {
    ...input,
    metadata,
    requestId: input.requestId ?? getRequestId() ?? null,
    actionSchemaVersion: actionSchema.version,
  };
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
