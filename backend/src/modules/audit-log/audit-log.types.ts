import type { Readable } from 'node:stream';
import type { JsonValue } from '../change-log/change-log.types';
import type {
  allowedAuditExportFormats,
  allowedAuditHashAlgorithms,
} from './audit-log.constants';

export type { AuditLogErrorCode } from './audit-log.constants';

export type AuditHashAlgorithm = (typeof allowedAuditHashAlgorithms)[number];

export type AuditExportFormat = (typeof allowedAuditExportFormats)[number];

export type AuditLogConfiguration = {
  readonly exportEnabled: boolean;
  readonly allowedFormats: readonly AuditExportFormat[];
  readonly tamperEvidentEnabled: boolean;
  readonly hashAlgorithm: AuditHashAlgorithm;
};

export type RecordAuditEntryInput = {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: JsonValue;
  readonly actorUserId: string | null;
  readonly requestId?: string | null;
  readonly organizationalUnitId?: string | null;
  readonly hashAlgorithm?: AuditHashAlgorithm;
};

export type AuditLogRecord = {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: JsonValue | null;
  readonly requestId: string | null;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly actorUserId: string | null;
  readonly organizationalUnitId: string | null;
  readonly createdAt: Date;
  /** Paket 2.6: missing on legacy callers/tests = 1 (hash over metadata). */
  readonly hashVersion?: number;
  readonly metadataDigest?: string | null;
  readonly redactedAt?: Date | null;
  /** Persisted and hash-bound for v3; absent on legacy in-memory fixtures. */
  readonly hashAlgorithm?: AuditHashAlgorithm;
  /** v5 independent append chain; legacy rows belong to `global`. */
  readonly chainPartition?: string;
};

export type AuditLogExportRow = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorUserId: string | null;
  readonly organizationalUnitId: string | null;
  readonly requestId: string | null;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly metadata: JsonValue | null;
};

export type AuditLogVerifyResult =
  | {
      readonly enabled: false;
      readonly status: 'disabled';
    }
  | ({
      readonly enabled: true;
      readonly valid: true;
      readonly checkedCount: number;
    } & AuditLogVerifyDetails)
  | ({
      readonly enabled: true;
      readonly valid: false;
      readonly checkedCount: number;
      readonly firstMismatchId: string;
      readonly firstMismatchIndex: number;
    } & AuditLogVerifyDetails);

/**
 * Paket 2.6 (§6.5): redacted v2 rows are fully verified (the hash commits to
 * the digest); redacted v1 rows are "sealed" — only the link to the neighbours
 * is verified. A checkpoint means older rows were purged by retention.
 */
export type AuditLogVerifyDetails = {
  readonly redactedCount?: number;
  readonly sealedCount?: number;
  readonly checkpoint?: {
    readonly throughHash: string;
    readonly throughCreatedAt: string;
    readonly purgedCount: number;
  } | null;
};

export type AuditLogExportResult = {
  readonly format: AuditExportFormat;
  readonly fileName: string;
  readonly contentType: string;
  readonly stream: Readable;
};

/**
 * A list row: the export shape plus the actor's display name. The export shape
 * itself (JSON/CSV columns, hash chain) is untouched — the name is a display
 * concern of the two list endpoints only, resolved with one extra query per
 * page. `null` when the row has no actor, or the account is gone.
 */
export type AuditLogListRow = AuditLogExportRow & {
  readonly actorDisplayName: string | null;
};

export type AuditLogListResult = {
  readonly items: readonly AuditLogListRow[];
  readonly nextCursor: string | null;
};

export type AuditLogWriteClient = {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  readonly auditLog: {
    findFirst(args: {
      where?: { chainPartition: string };
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }];
      select: { hash: true };
    }): Promise<{ hash: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

export type AuditLogTransactionalClient = AuditLogWriteClient & {
  $transaction?(
    callback: (client: AuditLogWriteClient) => Promise<void>,
  ): Promise<unknown>;
};
