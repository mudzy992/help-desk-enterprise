import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecentRequestLogBuffer } from '../../common/request-context/recent-request-log.buffer';
import { AuditLogService } from '../audit-log/audit-log.service';
import { collectConfigSnapshot } from '../config-versioning/collect-config-snapshot';
import { configVersioningScopeValues } from '../config-versioning/config-versioning.constants';
import { SettingsService } from '../settings/settings.service';
import { ObservabilityConfigurationLoader } from './observability-configuration.loader';
import { observabilityErrorCodes } from './observability.constants';
import { ObservabilityError } from './observability.error';
import { buildSupportBundleArchive } from './build-support-bundle-archive';
import {
  createSupportBundleManifest,
  listSupportBundleParts,
} from './create-support-bundle-manifest';
import { recordSupportBundleAudit } from './record-support-bundle-audit';
import type {
  SupportBundleArchive,
  SupportBundleConfiguration,
} from './observability.types';

@Injectable()
export class SupportBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
    private readonly configurationLoader: ObservabilityConfigurationLoader,
    private readonly requestLogBuffer: RecentRequestLogBuffer,
  ) {}

  async createArchive(input: {
    readonly actorUserId: string;
    readonly requestId: string;
  }): Promise<SupportBundleArchive> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.supportBundleEnabled) {
      throw new ObservabilityError(observabilityErrorCodes.disabled);
    }
    this.requestLogBuffer.setRetentionDays(configuration.requestLogRetentionDays);
    const generatedAt = new Date();
    const configSnapshotJson = await this.readConfigSnapshot(configuration);
    const auditExportJson = await this.readAuditExport(configuration);
    const recentLogsJsonl = this.readRecentLogs(configuration, generatedAt);
    const parts = listSupportBundleParts({
      configSnapshotJson,
      auditExportJson,
      recentLogsJsonl,
    });
    const archive = await buildSupportBundleArchive({
      generatedAt,
      manifest: createSupportBundleManifest({
        generatedAt,
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        configuration,
        parts,
      }),
      configSnapshotJson,
      auditExportJson,
      recentLogsJsonl,
    });
    await recordSupportBundleAudit(this.prisma, {
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      parts,
    });
    return archive;
  }

  private async readConfigSnapshot(
    configuration: SupportBundleConfiguration,
  ): Promise<string | null> {
    if (!configuration.includeConfigSnapshot) {
      return null;
    }
    const snapshot = await collectConfigSnapshot(
      this.prisma,
      this.settingsService,
      configVersioningScopeValues,
    );
    return `${JSON.stringify(snapshot, null, 2)}\n`;
  }

  private async readAuditExport(
    configuration: SupportBundleConfiguration,
  ): Promise<string | null> {
    if (!configuration.includeAuditExport) {
      return null;
    }
    return this.auditLogService.snapshotExportJson();
  }

  private readRecentLogs(
    configuration: SupportBundleConfiguration,
    generatedAt: Date,
  ): string | null {
    if (!configuration.includeRecentLogs) {
      return null;
    }
    const since = new Date(
      generatedAt.getTime() - configuration.recentLogsMinutes * 60_000,
    );
    const lines = this.requestLogBuffer
      .listSince(since)
      .map((entry) => JSON.stringify(entry));
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }
}
