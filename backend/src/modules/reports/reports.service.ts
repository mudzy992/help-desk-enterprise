import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { aggregateBottleneckDashboard } from './bottleneck/aggregate-bottleneck-dashboard';
import { buildReportPackRows, reportPackColumns } from './build-report-pack-rows';
import {
  buildReportsDashboard,
  type ReportsDashboard,
} from './dashboard/build-reports-dashboard';
import { loadReportPackBuildInput } from './load-report-pack-build-input';
import { loadScopedReportTickets } from './load-scoped-report-tickets';
import { recordReportExportAudit } from './record-report-export-audit';
import {
  reportErrorCodes,
  reportPackKeyList,
  reportPackLimits,
  reportPackSlugs,
  type ReportExportFormat,
  type ReportPackKey,
} from './reports.constants';
import { ReportsConfigurationLoader } from './reports-configuration.loader';
import { ReportsError } from './reports.error';
import { resolveReportOrganizationalUnitScope } from './resolve-report-organizational-unit-scope';
import { assertReportWindowSpan, resolveReportWindow } from './resolve-report-window';
import { serializeReportPackExport } from './serialize-report-pack-export';
import type {
  BottleneckDashboard,
  ExportReportPackQuery,
  ReportExportResult,
  ReportPackDescriptor,
  ReportPackPreview,
  ReportScopeQuery,
  ReportsConfiguration,
} from './reports.types';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: ReportsConfigurationLoader,
  ) {}

  /** Package 1.6: the packs this installation offers, in display order. */
  async listPacks(): Promise<{
    readonly packs: readonly ReportPackDescriptor[];
    readonly formats: readonly ReportExportFormat[];
    readonly limits: typeof reportPackLimits;
    readonly pingPongThreshold: number;
  }> {
    const configuration = await this.configurationLoader.load();
    this.assertReportsEnabled(configuration);
    return {
      packs: reportPackKeyList
        .filter((pack) => configuration.enabledPacks.includes(pack))
        .map((pack) => ({
          key: pack,
          slug: reportPackSlugs[pack],
          columns: reportPackColumns(pack),
        })),
      formats: configuration.allowedFormats,
      limits: reportPackLimits,
      pingPongThreshold: configuration.pingPongThreshold,
    };
  }

  /** Package 1.6 (plan §3 D3): first rows as JSON, not audited, not a file. */
  async previewPack(
    query: ReportScopeQuery & { readonly pack: ReportPackKey },
    now: Date = new Date(),
  ): Promise<ReportPackPreview> {
    const configuration = await this.requireReports(query.pack);
    const { window, built } = await this.buildPack(query, configuration, now);
    return {
      pack: query.pack,
      columns: built.columns,
      rows: built.rows.slice(0, reportPackLimits.previewRows),
      totalRows: built.rows.length,
      truncated: built.rows.length > reportPackLimits.previewRows,
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
    };
  }

  async exportPack(
    query: ExportReportPackQuery,
    actorUserId: string,
    requestId: string | null,
    now: Date = new Date(),
  ): Promise<ReportExportResult> {
    const configuration = await this.requireReports(query.pack, query.format);
    const { window, built } = await this.buildPack(query, configuration, now);
    if (built.rows.length > reportPackLimits.exportRows) {
      throw new ReportsError(reportErrorCodes.tooLarge);
    }
    const unit = await this.prisma.organizationalUnit.findUnique({
      where: { id: query.organizationalUnitId },
      select: { name: true },
    });
    const exported = serializeReportPackExport(
      query.pack,
      query.format,
      built.columns,
      built.rows,
      { unitCode: unit?.name ?? null, window },
    );
    await recordReportExportAudit(this.prisma, {
      actorUserId,
      organizationalUnitId: query.organizationalUnitId,
      pack: query.pack,
      format: query.format,
      recordCount: built.rows.length,
      requestId,
      window,
      fileName: exported.fileName,
    });
    return exported;
  }

  private async buildPack(
    query: ReportScopeQuery & { readonly pack: ReportPackKey },
    configuration: ReportsConfiguration,
    now: Date,
  ) {
    const window = resolveReportWindow({
      from: query.from,
      to: query.to,
      now,
      defaultWindowDays: configuration.defaultWindowDays,
      mode: 'month',
    });
    assertReportWindowSpan(window, reportPackLimits.maxWindowDays);
    const scopedIds = await resolveReportOrganizationalUnitScope(
      this.prisma,
      query.organizationalUnitId,
    );
    const built = buildReportPackRows(
      query.pack,
      await loadReportPackBuildInput(
        this.prisma,
        scopedIds,
        window,
        query.pack,
        configuration.pingPongThreshold,
      ),
    );
    return { window, built };
  }

  async bottleneck(
    query: ReportScopeQuery,
    now: Date = new Date(),
  ): Promise<BottleneckDashboard> {
    const configuration = await this.configurationLoader.load();
    this.assertReportsEnabled(configuration);
    if (!configuration.bottlenecksEnabled) {
      throw new ReportsError(reportErrorCodes.bottlenecksDisabled);
    }
    const window = resolveReportWindow({
      from: query.from,
      to: query.to,
      now,
      defaultWindowDays: configuration.defaultWindowDays,
      mode: 'rolling',
    });
    const scopedIds = await resolveReportOrganizationalUnitScope(
      this.prisma,
      query.organizationalUnitId,
    );
    const tickets = await loadScopedReportTickets(this.prisma, scopedIds, false);
    return aggregateBottleneckDashboard({ tickets, window });
  }

  async dashboard(
    query: ReportScopeQuery,
    now: Date = new Date(),
    unroutedLabel = 'Unrouted',
  ): Promise<ReportsDashboard> {
    const configuration = await this.configurationLoader.load();
    this.assertReportsEnabled(configuration);
    return buildReportsDashboard({
      prisma: this.prisma,
      configuration,
      query,
      now,
      unroutedLabel,
    });
  }

  private async requireReports(
    pack: ExportReportPackQuery['pack'],
    format?: ExportReportPackQuery['format'],
  ): Promise<ReportsConfiguration> {
    const configuration = await this.configurationLoader.load();
    this.assertReportsEnabled(configuration);
    if (!configuration.enabledPacks.includes(pack)) {
      throw new ReportsError(reportErrorCodes.packNotEnabled);
    }
    if (format !== undefined && !configuration.allowedFormats.includes(format)) {
      throw new ReportsError(reportErrorCodes.formatNotAllowed);
    }
    return configuration;
  }

  private assertReportsEnabled(configuration: ReportsConfiguration): void {
    if (!configuration.reportsEnabled || !configuration.addonEnabled) {
      throw new ReportsError(reportErrorCodes.disabled);
    }
  }
}
