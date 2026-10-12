import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import {
  auditLogActions,
  auditLogEntityTypes,
  auditLogErrorCodes,
} from './audit-log.constants';
import { AuditLogConfigurationLoader } from './audit-log-configuration.loader';
import { AuditLogError } from './audit-log.error';
import { AuditLogRepository } from './audit-log.repository';
import type {
  AuditExportFormat,
  AuditLogExportResult,
  AuditLogListResult,
  AuditLogListRow,
  AuditLogRecord,
  AuditLogVerifyResult,
} from './audit-log.types';
import { recordAuditEntry } from './record-audit-entry';
import { selectOrganizationalUnitIdsInScope } from './select-organizational-unit-ids-in-scope';
import {
  serializeAuditLogCsv,
  serializeAuditLogJson,
  toAuditLogExportRow,
} from './serialize-audit-log-export';
import { verifyAuditLogChain } from './verify-audit-log-chain';

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AuditLogRepository,
    private readonly configurationLoader: AuditLogConfigurationLoader,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
  ) {}

  async list(input: {
    readonly actorUserId: string;
    readonly organizationalUnitId: string;
    readonly take: number;
    readonly cursor: string | null;
  }): Promise<AuditLogListResult> {
    const authContext = await this.authorizationContextLoader.loadBySubjectId(
      input.actorUserId,
    );
    if (authContext === null) {
      throw new AuditLogError(auditLogErrorCodes.forbidden);
    }
    const units = await this.repository.listOrganizationalUnits();
    const requested = units.find((unit) => unit.id === input.organizationalUnitId);
    if (requested === undefined) {
      throw new AuditLogError(auditLogErrorCodes.organizationalUnitNotFound);
    }
    const scopedIds = selectOrganizationalUnitIdsInScope(units, requested.ouPath);
    const page = await this.repository.listPage({
      organizationalUnitIds: scopedIds,
      includeGlobalRecords: authContext.isSuperAdmin,
      take: input.take,
      cursor: input.cursor,
    });
    return this.toListPage(page.items, page.nextCursor);
  }

  /**
   * Paket 5.4.0-d (M6): the SUPER_ADMIN security journal. The `auth.` prefix is
   * enforced in the repository query, not at the caller, so a non-auth action
   * can never be read through this path even by a future caller that forgets
   * to check. Rows keep the exact shape the OU-scoped list returns.
   */
  async listAuthSecurityEvents(input: {
    readonly action: string | null;
    readonly userId: string | null;
    readonly take: number;
    readonly cursor: string | null;
  }): Promise<AuditLogListResult> {
    const page = await this.repository.listAuthPage({
      action: input.action,
      userId: input.userId,
      take: input.take,
      cursor: input.cursor,
    });
    return this.toListPage(page.items, page.nextCursor);
  }

  /**
   * Paket 5.4.0-f follow-up: list rows carry the actor's display name next to
   * the id. The UI showed `actorUserId` ("usr_…"), which tells an operator
   * nothing; the name is resolved with one query per page. The export path
   * (`export` below) deliberately keeps the export shape untouched.
   */
  private async toListPage(
    records: readonly AuditLogRecord[],
    nextCursor: string | null,
  ): Promise<AuditLogListResult> {
    const rows = records.map(toAuditLogExportRow);
    const actorIds = [
      ...new Set(
        rows
          .map((row) => row.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    ];
    // No actor on this page (e.g. a page of failed sign-ins) = no query at all.
    const names =
      actorIds.length === 0
        ? new Map<string, string>()
        : await this.repository.listActorDisplayNames(actorIds);
    const items: AuditLogListRow[] = rows.map((row) => ({
      ...row,
      actorDisplayName:
        row.actorUserId === null ? null : (names.get(row.actorUserId) ?? null),
    }));
    return { items, nextCursor };
  }

  async export(input: {
    readonly actorUserId: string;
    readonly organizationalUnitId: string;
    readonly format: AuditExportFormat;
    readonly requestId: string | null;
  }): Promise<AuditLogExportResult> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.exportEnabled) {
      throw new AuditLogError(auditLogErrorCodes.exportDisabled);
    }
    if (!configuration.allowedFormats.includes(input.format)) {
      throw new AuditLogError(auditLogErrorCodes.formatNotAllowed);
    }
    const authContext = await this.authorizationContextLoader.loadBySubjectId(
      input.actorUserId,
    );
    if (authContext === null) {
      throw new AuditLogError(auditLogErrorCodes.forbidden);
    }
    const units = await this.repository.listOrganizationalUnits();
    const requested = units.find((unit) => unit.id === input.organizationalUnitId);
    if (requested === undefined) {
      throw new AuditLogError(auditLogErrorCodes.organizationalUnitNotFound);
    }
    const scopedIds = selectOrganizationalUnitIdsInScope(units, requested.ouPath);
    const records = await this.repository.listForExport({
      organizationalUnitIds: scopedIds,
      includeGlobalRecords: authContext.isSuperAdmin,
    });
    const rows = records.map(toAuditLogExportRow);
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.auditExport,
      entityType: auditLogEntityTypes.auditLog,
      entityId: input.organizationalUnitId,
      metadata: {
        format: input.format,
        recordCount: rows.length,
      },
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      organizationalUnitId: input.organizationalUnitId,
      hashAlgorithm: configuration.hashAlgorithm,
    });
    return serializeExport(input.format, rows);
  }

  async snapshotExportJson(): Promise<string> {
    const records = await this.repository.listChain();
    return serializeAuditLogJson(records.map(toAuditLogExportRow));
  }

  async verify(): Promise<AuditLogVerifyResult> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.tamperEvidentEnabled) {
      return { enabled: false, status: 'disabled' };
    }
    return verifyAuditLogChain({
      records: await this.repository.listChain(),
      hashAlgorithm: configuration.hashAlgorithm,
      start: await this.repository.findLatestCheckpoint(),
    });
  }
}

function serializeExport(
  format: AuditExportFormat,
  rows: ReturnType<typeof toAuditLogExportRow>[],
): AuditLogExportResult {
  if (format === 'csv') {
    return {
      format,
      fileName: 'audit-log.csv',
      contentType: 'text/csv; charset=utf-8',
      content: serializeAuditLogCsv(rows),
    };
  }
  return {
    format,
    fileName: 'audit-log.json',
    contentType: 'application/json; charset=utf-8',
    content: serializeAuditLogJson(rows),
  };
}
