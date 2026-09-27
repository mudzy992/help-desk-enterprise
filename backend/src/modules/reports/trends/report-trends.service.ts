import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { reportErrorCodes, type ReportExportFormat } from '../reports.constants';
import { ReportsConfigurationLoader } from '../reports-configuration.loader';
import { ReportsError } from '../reports.error';
import { resolveReportOrganizationalUnitScope } from '../resolve-report-organizational-unit-scope';
import { reportFileBaseName } from '../serialize-report-pack-export';
import { serializeReportCsv, serializeReportJson } from '../serialize-report-export';
import type { ReportExportResult } from '../reports.types';
import { assembleReportTrends } from './assemble-report-trends';
import { buildReportTrendBuckets } from './build-report-trend-buckets';
import { reportTrendsCacheKey, ReportTrendsCache } from './report-trends.cache';
import { ReportTrendsConfigurationLoader } from './report-trends-configuration.loader';
import { reportTrendSourceToken } from './report-trends.tokens';
import { reportTrendExportColumns, toReportTrendExportRows } from './report-trend-export-rows';
import type {
  ReportTrends,
  ReportTrendsConfiguration,
  ReportTrendSource,
  ReportTrendsQuery,
} from './report-trends.types';

/** Paket 2.5 (T): the trends dashboard, its export and the data of scheduled reports. */
@Injectable()
export class ReportTrendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsConfigurationLoader: ReportsConfigurationLoader,
    private readonly configurationLoader: ReportTrendsConfigurationLoader,
    private readonly cache: ReportTrendsCache,
    @Inject(reportTrendSourceToken) private readonly source: ReportTrendSource,
  ) {}

  async trends(query: ReportTrendsQuery, now: Date = new Date()): Promise<ReportTrends> {
    const configuration = await this.requireTrends();
    return this.compute(query, configuration, now);
  }

  /**
   * The same computation without the „trends enabled” switch — scheduled
   * reports have their own switch and must not stop because the dashboard is off.
   */
  async computeForSchedule(query: ReportTrendsQuery, now: Date): Promise<ReportTrends> {
    return this.compute(query, await this.configurationLoader.load(), now);
  }

  async exportTrends(
    query: ReportTrendsQuery,
    format: ReportExportFormat,
    actorUserId: string,
    requestId: string | null,
    now: Date = new Date(),
  ): Promise<ReportExportResult> {
    const configuration = await this.requireTrends();
    const reports = await this.reportsConfigurationLoader.load();
    if (!reports.allowedFormats.includes(format)) {
      throw new ReportsError(reportErrorCodes.formatNotAllowed);
    }
    const trends = await this.compute(query, configuration, now);
    const rows = toReportTrendExportRows(trends);
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: query.organizationalUnitId },
      select: { name: true },
    });
    const window = { from: new Date(trends.window.from), to: new Date(trends.window.to) };
    const base = reportFileBaseName('trends', { unitCode: unit?.name ?? null, window });
    const exported: ReportExportResult =
      format === 'csv'
        ? {
            format,
            fileName: `${base}.csv`,
            contentType: 'text/csv; charset=utf-8',
            content: serializeReportCsv(reportTrendExportColumns, rows),
          }
        : {
            format,
            fileName: `${base}.json`,
            contentType: 'application/json; charset=utf-8',
            content: serializeReportJson(rows),
          };
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.reportTrendsExported,
      entityType: auditLogEntityTypes.reportTrends,
      entityId: query.organizationalUnitId,
      metadata: {
        format,
        recordCount: rows.length,
        granularity: trends.granularity,
        from: trends.window.from,
        to: trends.window.to,
        serviceId: query.serviceId ?? null,
        groupId: query.groupId ?? null,
        priority: query.priority ?? null,
        fileName: exported.fileName,
      },
      actorUserId,
      requestId,
      organizationalUnitId: query.organizationalUnitId,
    });
    return exported;
  }

  /** Design §6: the print/PDF export leaves an audit trace (no content). */
  async recordPdfExport(
    input: { readonly organizationalUnitId: string; readonly view: string; readonly from?: string; readonly to?: string },
    actorUserId: string,
    requestId: string | null,
  ): Promise<void> {
    await this.requireReports();
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.reportPdfExported,
      entityType: auditLogEntityTypes.reportTrends,
      entityId: input.organizationalUnitId,
      metadata: { view: input.view, from: input.from ?? null, to: input.to ?? null },
      actorUserId,
      requestId,
      organizationalUnitId: input.organizationalUnitId,
    });
  }

  private async compute(
    query: ReportTrendsQuery,
    configuration: ReportTrendsConfiguration,
    now: Date,
  ): Promise<ReportTrends> {
    const plan = buildReportTrendBuckets({
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      timeZone: configuration.timeZone,
      now,
      maxMonths: configuration.maxMonths,
    });
    const scopedIds = await resolveReportOrganizationalUnitScope(this.prisma, query.organizationalUnitId);
    const first = plan.buckets[0];
    const last = plan.buckets[plan.buckets.length - 1];
    const cacheKey = reportTrendsCacheKey({
      v: 1,
      unit: query.organizationalUnitId,
      units: [...scopedIds].sort().join(','),
      service: query.serviceId,
      group: query.groupId,
      priority: query.priority,
      granularity: plan.granularity,
      from: first?.key,
      to: last?.key,
      zone: configuration.timeZone,
      sla: configuration.slaTargetPercent,
      csat: configuration.csatMinSample,
    });
    const cached = await this.cache.read(cacheKey);
    if (cached !== null) {
      return cached;
    }
    const raw = await this.source.load({
      organizationalUnitIds: scopedIds,
      serviceId: query.serviceId,
      groupId: query.groupId,
      priority: query.priority,
      boundaries: [...plan.buckets.map((bucket) => bucket.start), ...(last === undefined ? [] : [last.end])],
      previous: plan.previous,
    });
    const trends = assembleReportTrends({
      plan,
      raw,
      query,
      timeZone: configuration.timeZone,
      slaTargetPercent: configuration.slaTargetPercent,
      csatMinSample: configuration.csatMinSample,
      now,
    });
    await this.cache.write(cacheKey, trends, configuration.cacheSeconds);
    return trends;
  }

  private async requireReports(): Promise<void> {
    const reports = await this.reportsConfigurationLoader.load();
    if (!reports.reportsEnabled || !reports.addonEnabled) {
      throw new ReportsError(reportErrorCodes.disabled);
    }
  }

  private async requireTrends(): Promise<ReportTrendsConfiguration> {
    await this.requireReports();
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) {
      throw new ReportsError(reportErrorCodes.trendsDisabled);
    }
    return configuration;
  }
}
