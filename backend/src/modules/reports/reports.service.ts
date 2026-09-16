import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { aggregateBottleneckDashboard } from './bottleneck/aggregate-bottleneck-dashboard';
import { buildReportPackRows } from './build-report-pack-rows';
import {
  buildReportsDashboard,
  type ReportsDashboard,
} from './dashboard/build-reports-dashboard';
import { loadReportPackBuildInput } from './load-report-pack-build-input';
import { loadScopedReportTickets } from './load-scoped-report-tickets';
import { recordReportExportAudit } from './record-report-export-audit';
import { reportErrorCodes } from './reports.constants';
import { ReportsConfigurationLoader } from './reports-configuration.loader';
import { ReportsError } from './reports.error';
import { resolveReportOrganizationalUnitScope } from './resolve-report-organizational-unit-scope';
import { resolveReportWindow } from './resolve-report-window';
import { serializeReportPackExport } from './serialize-report-pack-export';
import type {
  BottleneckDashboard,
  ExportReportPackQuery,
  ReportExportResult,
  ReportScopeQuery,
  ReportsConfiguration,
} from './reports.types';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: ReportsConfigurationLoader,
  ) {}

  async exportPack(
    query: ExportReportPackQuery,
    actorUserId: string,
    requestId: string | null,
    now: Date = new Date(),
  ): Promise<ReportExportResult> {
    const configuration = await this.requireReports(query.pack, query.format);
    const window = resolveReportWindow({
      from: query.from,
      to: query.to,
      now,
      defaultWindowDays: configuration.defaultWindowDays,
      mode: 'month',
    });
    const scopedIds = await resolveReportOrganizationalUnitScope(
      this.prisma,
      query.organizationalUnitId,
    );
    const built = buildReportPackRows(
      query.pack,
      await loadReportPackBuildInput(this.prisma, scopedIds, window),
    );
    const exported = serializeReportPackExport(
      query.pack,
      query.format,
      built.columns,
      built.rows,
    );
    await recordReportExportAudit(this.prisma, {
      actorUserId,
      organizationalUnitId: query.organizationalUnitId,
      pack: query.pack,
      format: query.format,
      recordCount: built.rows.length,
      requestId,
    });
    return exported;
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
    format: ExportReportPackQuery['format'],
  ): Promise<ReportsConfiguration> {
    const configuration = await this.configurationLoader.load();
    this.assertReportsEnabled(configuration);
    if (!configuration.enabledPacks.includes(pack)) {
      throw new ReportsError(reportErrorCodes.packNotEnabled);
    }
    if (!configuration.allowedFormats.includes(format)) {
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
