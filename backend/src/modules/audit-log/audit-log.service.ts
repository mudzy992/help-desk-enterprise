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

  async verify(): Promise<AuditLogVerifyResult> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.tamperEvidentEnabled) {
      return { enabled: false, status: 'disabled' };
    }
    return verifyAuditLogChain({
      records: await this.repository.listChain(),
      hashAlgorithm: configuration.hashAlgorithm,
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
