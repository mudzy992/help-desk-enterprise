import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { resolveEmailLocale } from '../../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../../notifications/email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../../notifications/email/is-allowed-notification-email-address';
import {
  loadEmailChannelConfiguration,
  type EmailChannelConfiguration,
} from '../../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport, type OutboundMailAttachment } from '../../notifications/email/mail-transport';
import { SettingsService } from '../../settings/settings.service';
import { buildReportPackRows } from '../build-report-pack-rows';
import { loadReportPackBuildInput } from '../load-report-pack-build-input';
import { reportPackKeyList, type ReportPackKey } from '../reports.constants';
import { ReportsConfigurationLoader } from '../reports-configuration.loader';
import { resolveReportOrganizationalUnitScope } from '../resolve-report-organizational-unit-scope';
import { reportFileBaseName } from '../serialize-report-pack-export';
import { serializeReportCsv } from '../serialize-report-export';
import { civilDayKey } from '../trends/civil-calendar';
import { ReportTrendsService } from '../trends/report-trends.service';
import { composeScheduledReportEmail } from './compose-scheduled-report-email';
import { ReportAccessChecker, type ReportRecipientUser } from './report-access.checker';
import { nextReportRunAt, previousReportPeriod, trendFirstDay, type ReportPeriod } from './report-schedule-calendar';
import {
  reportAttachmentOmitReasons,
  reportRecipientSkipReasons,
  reportRunErrorCodes,
  reportScheduleLimits,
  reportScheduleTopRows,
  reportScheduleTrendBuckets,
  type ReportAttachmentOmitReason,
  type ReportRecipientSkipReason,
} from './report-schedule.constants';
import { reportScheduleSelect, type ReportScheduleRecord } from './report-schedule.record';
import {
  ReportSchedulesConfigurationLoader,
  type ReportSchedulesConfiguration,
} from './report-schedules-configuration.loader';
import type { ScheduledReportContent } from './scheduled-report-content';

const openStatusesExcluded = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export type ScheduledReportAttachments = {
  readonly attachments: readonly OutboundMailAttachment[];
  readonly omitted: readonly { readonly pack: string; readonly reason: ReportAttachmentOmitReason }[];
};

export type ReportRunOutcome = {
  readonly runId: string | null;
  readonly status: 'SENT' | 'PARTIAL' | 'SKIPPED' | 'FAILED';
  readonly sentCount: number;
  readonly skipped: readonly { readonly userId: string; readonly reason: ReportRecipientSkipReason }[];
};

/**
 * Paket 2.5 (§5.4): builds and sends scheduled reports. Shared by the worker
 * (sweep, „send now”) and the API („send a test to me”), so all three send
 * the same e-mail.
 */
@Injectable()
export class ScheduledReportRunner {
  private readonly logger = new Logger('ScheduledReports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly trendsService: ReportTrendsService,
    private readonly reportsConfigurationLoader: ReportsConfigurationLoader,
    private readonly configurationLoader: ReportSchedulesConfigurationLoader,
    private readonly accessChecker: ReportAccessChecker,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  /** The 5-minute sweep: every due schedule, at most `schedulesPerSweep` per pass. */
  async runDue(now: Date = new Date()): Promise<{ readonly processed: number }> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) return { processed: 0 };
    const due = (await this.prisma.reportSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      select: reportScheduleSelect,
      orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
      take: reportScheduleLimits.schedulesPerSweep,
    })) as unknown as ReportScheduleRecord[];
    for (const schedule of due) {
      try {
        await this.processDue(schedule, configuration, now);
      } catch (error) {
        this.logger.warn(
          `report_schedule_failed schedule=${schedule.id} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await this.pruneRuns(now);
    return { processed: due.length };
  }

  /** „Pošalji sada” (queued by the API): recipients get it now, no slot is consumed. */
  async runManual(scheduleId: string, actorUserId: string | null, now: Date = new Date()): Promise<ReportRunOutcome | null> {
    const configuration = await this.configurationLoader.load();
    const schedule = (await this.prisma.reportSchedule.findUnique({
      where: { id: scheduleId },
      select: reportScheduleSelect,
    })) as unknown as ReportScheduleRecord | null;
    if (schedule === null) return null;
    const period = previousReportPeriod(schedule.frequency, configuration.timeZone, now);
    const run = await this.prisma.reportScheduleRun.create({
      data: {
        scheduleId,
        trigger: 'MANUAL',
        slotKey: null,
        periodStart: period.start,
        periodEnd: period.end,
        status: 'RUNNING',
        triggeredByUserId: actorUserId,
      },
      select: { id: true },
    });
    return this.execute(schedule, configuration, period, now, {
      runId: run.id,
      dedupeKey: `report:${run.id}`,
      actorUserId,
      trigger: 'MANUAL',
    });
  }

  /** „Pošalji test meni”: only to the actor, previous period, no run record. */
  async sendTest(
    schedule: ReportScheduleRecord,
    actor: ReportRecipientUser,
    now: Date = new Date(),
  ): Promise<{ readonly sent: boolean; readonly reason?: string }> {
    const configuration = await this.configurationLoader.load();
    const channel = await loadEmailChannelConfiguration(this.settingsService);
    if (!channel.deliveryEnabled || channel.smtp === null) {
      return { sent: false, reason: 'EMAIL_CHANNEL_DISABLED' };
    }
    const period = previousReportPeriod(schedule.frequency, configuration.timeZone, now);
    const content = await this.buildContent(schedule, period, now);
    const files = await this.buildAttachments(schedule, period, configuration);
    const composed = composeScheduledReportEmail({
      configuration: channel,
      locale: resolveEmailLocale(actor.preferredLocale, channel),
      recipientId: actor.id,
      recipientName: actor.displayName,
      scheduleName: schedule.name,
      ownerName: schedule.createdBy?.displayName ?? null,
      content,
      attachmentNames: files.attachments.map((file) => file.filename),
      omitted: files.omitted,
      attachmentMaxRows: configuration.attachmentMaxRows,
      dedupeKey: `report-test:${now.getTime()}`,
      test: true,
    });
    await this.mailTransport.send(
      {
        from: channel.smtp.fromAddress,
        to: actor.email,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
        attachments: files.attachments,
      },
      channel.smtp,
    );
    return { sent: true };
  }

  private async processDue(
    schedule: ReportScheduleRecord,
    configuration: ReportSchedulesConfiguration,
    now: Date,
  ): Promise<void> {
    const timeZone = configuration.timeZone;
    // Worker was down: only the latest missed slot is sent (§5.4), older ones are logged as missed.
    let slot = schedule.nextRunAt;
    let next = nextReportRunAt(schedule.frequency, schedule.sendTime, timeZone, slot);
    const missed: Date[] = [];
    while (next.getTime() <= now.getTime()) {
      missed.push(slot);
      slot = next;
      next = nextReportRunAt(schedule.frequency, schedule.sendTime, timeZone, slot);
    }
    if (missed.length > 0) {
      await this.prisma.reportScheduleRun.createMany({
        data: missed.map((missedSlot) => {
          const period = previousReportPeriod(schedule.frequency, timeZone, missedSlot);
          return {
            scheduleId: schedule.id,
            trigger: 'SCHEDULED' as const,
            slotKey: slotKeyOf(schedule.id, period),
            periodStart: period.start,
            periodEnd: period.end,
            status: 'SKIPPED' as const,
            errorCode: reportRunErrorCodes.missed,
            finishedAt: now,
          };
        }),
        skipDuplicates: true,
      });
    }
    const period = previousReportPeriod(schedule.frequency, timeZone, slot);
    const slotKey = slotKeyOf(schedule.id, period);
    const runId = await this.claim(schedule.id, slotKey, period, now);
    // Advance first: a crash while sending must not make the sweep pick the slot again
    // (a stale RUNNING run is taken over instead, see `claim`).
    await this.prisma.reportSchedule.updateMany({
      where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
      data: { nextRunAt: next, ...(runId === null ? {} : { lastRunAt: now }) },
    });
    if (runId === null) return;
    await this.execute(schedule, configuration, period, now, {
      runId,
      dedupeKey: `report:${slotKey}`,
      actorUserId: null,
      trigger: 'SCHEDULED',
    });
  }

  /**
   * The idempotency gate (§5.3): the unique `slotKey` lets exactly one worker
   * create the run. A RUNNING run older than `staleRunMs` (crashed worker) is
   * taken over; per-recipient delivery dedupe prevents a second e-mail.
   */
  private async claim(scheduleId: string, slotKey: string, period: ReportPeriod, now: Date): Promise<string | null> {
    try {
      const run = await this.prisma.reportScheduleRun.create({
        data: {
          scheduleId,
          trigger: 'SCHEDULED',
          slotKey,
          periodStart: period.start,
          periodEnd: period.end,
          status: 'RUNNING',
        },
        select: { id: true },
      });
      return run.id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    const taken = await this.prisma.reportScheduleRun.updateMany({
      where: {
        slotKey,
        status: 'RUNNING',
        createdAt: { lt: new Date(now.getTime() - reportScheduleLimits.staleRunMs) },
      },
      data: { createdAt: now },
    });
    if (taken.count === 0) return null;
    const run = await this.prisma.reportScheduleRun.findUnique({ where: { slotKey }, select: { id: true } });
    return run?.id ?? null;
  }

  private async execute(
    schedule: ReportScheduleRecord,
    configuration: ReportSchedulesConfiguration,
    period: ReportPeriod,
    now: Date,
    context: {
      readonly runId: string;
      readonly dedupeKey: string;
      readonly actorUserId: string | null;
      readonly trigger: 'SCHEDULED' | 'MANUAL';
    },
  ): Promise<ReportRunOutcome> {
    const startedAt = Date.now();
    const skipped: { userId: string; reason: ReportRecipientSkipReason }[] = [];
    let omitted: ScheduledReportAttachments['omitted'] = [];
    let sentCount = 0;
    let errorCode: string | null = null;
    const recipientIds = schedule.recipients.map((recipient) => recipient.userId);
    try {
      const reports = await this.reportsConfigurationLoader.load();
      const channel = await loadEmailChannelConfiguration(this.settingsService);
      if (!reports.reportsEnabled || !reports.addonEnabled) {
        errorCode = reportRunErrorCodes.reportsDisabled;
      } else if (!channel.deliveryEnabled || channel.smtp === null) {
        errorCode = reportRunErrorCodes.emailDisabled;
      } else {
        // §5.2: recipients are re-checked at send time.
        const verdicts = await this.accessChecker.evaluate(recipientIds, schedule.organizationalUnitId);
        const eligible: ReportRecipientUser[] = [];
        for (const verdict of verdicts) {
          if (!verdict.ok) {
            skipped.push({ userId: verdict.userId, reason: verdict.reason });
          } else if (!isAllowedNotificationEmailAddress(verdict.user.email, emailPolicy(channel))) {
            skipped.push({ userId: verdict.user.id, reason: reportRecipientSkipReasons.emailNotAllowed });
          } else {
            eligible.push(verdict.user);
          }
        }
        if (eligible.length === 0) {
          errorCode = reportRunErrorCodes.noRecipients;
        } else {
          const content = await this.buildContent(schedule, period, now);
          const files = await this.buildAttachments(schedule, period, configuration);
          omitted = files.omitted;
          for (const user of eligible) {
            try {
              await this.deliver(schedule, user, content, files, channel, configuration, context.dedupeKey);
              sentCount += 1;
            } catch (error) {
              skipped.push({ userId: user.id, reason: reportRecipientSkipReasons.deliveryFailed });
              this.logger.warn(
                `report_schedule_delivery_failed schedule=${schedule.id} user=${user.id} reason=${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
      }
    } catch (error) {
      errorCode = reportRunErrorCodes.buildFailed;
      this.logger.warn(
        `report_schedule_build_failed schedule=${schedule.id} reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const status: ReportRunOutcome['status'] =
      errorCode === reportRunErrorCodes.noRecipients
        ? 'SKIPPED'
        : errorCode !== null || sentCount === 0
          ? 'FAILED'
          : skipped.length > 0
            ? 'PARTIAL'
            : 'SENT';
    await this.prisma.reportScheduleRun.update({
      where: { id: context.runId },
      data: {
        status,
        recipientCount: recipientIds.length,
        sentCount,
        skipped: skipped as never,
        omittedAttachments: omitted as never,
        errorCode,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date(),
      },
    });
    await recordAuditEntry(this.prisma, {
      action: auditLogActions.reportScheduleSent,
      entityType: auditLogEntityTypes.reportSchedule,
      entityId: schedule.id,
      metadata: {
        runId: context.runId,
        trigger: context.trigger,
        status,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        recipientCount: recipientIds.length,
        sentCount,
        skippedCount: skipped.length,
        errorCode,
      },
      actorUserId: context.actorUserId,
      organizationalUnitId: schedule.organizationalUnitId,
    });
    this.logger.log(
      `report_schedule_run schedule=${schedule.id} trigger=${context.trigger} status=${status} sent=${sentCount} skipped=${skipped.length} duration_ms=${Date.now() - startedAt}`,
    );
    return { runId: context.runId, status, sentCount, skipped };
  }

  private async deliver(
    schedule: ReportScheduleRecord,
    user: ReportRecipientUser,
    content: ScheduledReportContent,
    files: ScheduledReportAttachments,
    channel: EmailChannelConfiguration,
    configuration: ReportSchedulesConfiguration,
    dedupeKey: string,
  ): Promise<void> {
    const composed = composeScheduledReportEmail({
      configuration: channel,
      locale: resolveEmailLocale(user.preferredLocale, channel),
      recipientId: user.id,
      recipientName: user.displayName,
      scheduleName: schedule.name,
      ownerName: schedule.createdBy?.displayName ?? null,
      content,
      attachmentNames: files.attachments.map((file) => file.filename),
      omitted: files.omitted,
      attachmentMaxRows: configuration.attachmentMaxRows,
      dedupeKey,
    });
    // Individually, never BCC (§5.4); the delivery row dedupes a retried run.
    await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
      userId: user.id,
      toAddress: user.email,
      dedupeKey,
      templateKey: 'report.scheduled',
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
      messageId: composed.messageId,
      headers: composed.headers,
      attachments: files.attachments,
    });
  }

  /** Same SQL layer as the Trends tab (§5.4 step 3). */
  async buildContent(schedule: ReportScheduleRecord, period: ReportPeriod, now: Date): Promise<ScheduledReportContent> {
    const granularity = schedule.frequency === 'WEEKLY' ? 'week' : 'month';
    const firstDay = trendFirstDay(schedule.frequency, period, reportScheduleTrendBuckets);
    const filters = {
      organizationalUnitId: schedule.organizationalUnitId,
      ...(schedule.serviceId === null ? {} : { serviceId: schedule.serviceId }),
      ...(schedule.groupId === null ? {} : { groupId: schedule.groupId }),
      ...(schedule.priority === null ? {} : { priority: schedule.priority }),
    };
    const trend = await this.trendsService.computeForSchedule(
      { ...filters, from: civilDayKey(firstDay), to: civilDayKey(period.lastDay), granularity },
      now,
    );
    const top = schedule.sections.includes('topServices')
      ? (
          await this.trendsService.computeForSchedule(
            { ...filters, from: civilDayKey(period.firstDay), to: civilDayKey(period.lastDay), granularity },
            now,
          )
        ).topServices
      : null;
    const overdue = schedule.sections.includes('overdue') ? await this.loadOverdue(schedule) : null;
    return {
      frequency: schedule.frequency,
      sections: schedule.sections,
      period,
      scope: {
        organizationalUnitId: schedule.organizationalUnitId,
        unitName: schedule.organizationalUnit.name,
        serviceId: schedule.serviceId,
        serviceName: schedule.service?.name ?? null,
        groupId: schedule.groupId,
        groupName: schedule.group?.name ?? null,
        priority: schedule.priority,
      },
      trendPoints: trend.points,
      topServices: top,
      overdue,
      settings: {
        slaTargetPercent: trend.settings.slaTargetPercent,
        csatMinSample: trend.settings.csatMinSample,
      },
      trendFirstDay: firstDay,
    };
  }

  /** Open tickets past an SLA deadline now (same flags as `isTicketSlaOverdue`). */
  private async loadOverdue(schedule: ReportScheduleRecord): Promise<NonNullable<ScheduledReportContent['overdue']>> {
    const unitIds = await resolveReportOrganizationalUnitScope(this.prisma, schedule.organizationalUnitId);
    if (unitIds.length === 0) return { rows: [], total: 0 };
    const grouped = (await this.prisma.ticket.groupBy({
      by: ['serviceId'],
      where: {
        originUnitId: { in: [...unitIds] },
        status: { notIn: [...openStatusesExcluded] as never },
        mergedIntoTicketId: null,
        ...(schedule.serviceId === null ? {} : { serviceId: schedule.serviceId }),
        ...(schedule.groupId === null ? {} : { assignedGroupId: schedule.groupId }),
        ...(schedule.priority === null ? {} : { priority: schedule.priority }),
        slaState: { is: { OR: [{ isResponseBreached: true }, { isResolutionBreached: true }] } },
      },
      _count: { _all: true },
    } as never)) as unknown as { serviceId: string; _count: { _all: number } }[];
    const sorted = grouped
      .map((row) => ({ serviceId: row.serviceId, count: row._count._all }))
      .sort((left, right) => right.count - left.count || left.serviceId.localeCompare(right.serviceId));
    const top = sorted.slice(0, reportScheduleTopRows);
    const names = new Map(
      (
        await this.prisma.service.findMany({
          where: { id: { in: top.map((row) => row.serviceId) } },
          select: { id: true, name: true },
        })
      ).map((service) => [service.id, service.name]),
    );
    return {
      rows: top.map((row) => ({ name: names.get(row.serviceId) ?? row.serviceId, count: row.count })),
      total: sorted.reduce((sum, row) => sum + row.count, 0),
    };
  }

  /** §5.2: report packs as CSV, capped per pack (rows) and in total (10 MB). */
  async buildAttachments(
    schedule: ReportScheduleRecord,
    period: ReportPeriod,
    configuration: ReportSchedulesConfiguration,
  ): Promise<ScheduledReportAttachments> {
    const attachments: OutboundMailAttachment[] = [];
    const omitted: { pack: string; reason: ReportAttachmentOmitReason }[] = [];
    if (schedule.packKeys.length === 0) return { attachments, omitted };
    const reports = await this.reportsConfigurationLoader.load();
    const unitIds = await resolveReportOrganizationalUnitScope(this.prisma, schedule.organizationalUnitId);
    // Pack windows are inclusive: the last millisecond of the period.
    const window = { from: period.start, to: new Date(period.end.getTime() - 1) };
    let totalBytes = 0;
    for (const key of schedule.packKeys) {
      const pack = key as ReportPackKey;
      if (!reportPackKeyList.includes(pack) || !reports.enabledPacks.includes(pack)) {
        omitted.push({ pack: key, reason: reportAttachmentOmitReasons.packDisabled });
        continue;
      }
      try {
        const built = buildReportPackRows(
          pack,
          await loadReportPackBuildInput(this.prisma, unitIds, window, pack, reports.pingPongThreshold),
        );
        if (built.rows.length > configuration.attachmentMaxRows) {
          omitted.push({ pack: key, reason: reportAttachmentOmitReasons.tooManyRows });
          continue;
        }
        const content = serializeReportCsv(built.columns, built.rows);
        const bytes = Buffer.byteLength(content, 'utf8');
        if (totalBytes + bytes > reportScheduleLimits.attachmentsMaxBytes) {
          omitted.push({ pack: key, reason: reportAttachmentOmitReasons.tooLarge });
          continue;
        }
        totalBytes += bytes;
        const base = reportFileBaseName(pack, { unitCode: schedule.organizationalUnit.name, window });
        attachments.push({ filename: `${base}.csv`, content, contentType: 'text/csv; charset=utf-8' });
      } catch (error) {
        omitted.push({ pack: key, reason: reportAttachmentOmitReasons.failed });
        this.logger.warn(
          `report_schedule_attachment_failed schedule=${schedule.id} pack=${key} reason=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { attachments, omitted };
  }

  /** §5.3: the run log is kept 180 days. */
  private async pruneRuns(now: Date): Promise<void> {
    await this.prisma.reportScheduleRun
      .deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - reportScheduleLimits.runRetentionDays * 86_400_000) } },
      })
      .catch(() => undefined);
  }
}

export function slotKeyOf(scheduleId: string, period: ReportPeriod): string {
  return `${scheduleId}:${period.start.toISOString()}`;
}

function emailPolicy(channel: EmailChannelConfiguration) {
  return {
    internalOnly: channel.internalOnly,
    allowedExternalDomains: channel.allowedExternalDomains,
    allowedExternalEmails: channel.allowedExternalEmails,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}
