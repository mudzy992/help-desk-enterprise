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
  | {
      readonly enabled: true;
      readonly valid: true;
      readonly checkedCount: number;
    }
  | {
      readonly enabled: true;
      readonly valid: false;
      readonly checkedCount: number;
      readonly firstMismatchId: string;
      readonly firstMismatchIndex: number;
    };

export type AuditLogExportResult = {
  readonly format: AuditExportFormat;
  readonly fileName: string;
  readonly contentType: string;
  readonly content: string;
};

export type AuditLogWriteClient = {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  readonly auditLog: {
    findFirst(args: {
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
