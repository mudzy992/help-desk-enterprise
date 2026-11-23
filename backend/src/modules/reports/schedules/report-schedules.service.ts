import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { RecordAuditEntryInput } from '../../audit-log/audit-log.types';
import type { Prisma } from '../../../generated/prisma/client';
import {
  OptimisticConcurrencyError,
  optimisticConcurrencyErrorCodes,
} from '../../../common/optimistic-concurrency/optimistic-concurrency.error';
import { formatVersionEtag } from '../../../common/optimistic-concurrency/optimistic-concurrency.service';
import type { SaveReportScheduleDto } from '../dto/report-schedule.dto';
import { reportErrorCodes, type ReportPackKey } from '../reports.constants';
import { ReportsConfigurationLoader } from '../reports-configuration.loader';
import { ReportsError } from '../reports.error';
import { ReportAccessChecker, type ReportRecipientUser } from './report-access.checker';
import { nextReportRunAt } from './report-schedule-calendar';
import {
  reportScheduleLimits,
  reportSchedulesManualJobName,
  reportSchedulesQueueName,
  reportScheduleSections,
} from './report-schedule.constants';
import { withReportScheduleLimit } from './report-schedule-limit';
import { isGroupWithinUnitSubtree } from './report-schedule-scope';
import { reportScheduleSelect, type ReportScheduleRecord } from './report-schedule.record';
import {
  ReportSchedulesConfigurationLoader,
  type ReportSchedulesConfiguration,
} from './report-schedules-configuration.loader';
import { ScheduledReportRunner } from './scheduled-report.runner';

export type ReportScheduleView = {
  readonly id: string;
  readonly name: string;
  readonly frequency: ReportScheduleRecord['frequency'];
  readonly sendTime: string;
  readonly organizationalUnit: { readonly id: string; readonly name: string };
  readonly service: { readonly id: string; readonly name: string } | null;
  readonly group: { readonly id: string; readonly name: string } | null;
  readonly priority: ReportScheduleRecord['priority'];
  readonly sections: readonly string[];
  readonly packKeys: readonly string[];
  readonly enabled: boolean;
  /** W7.95 (`BA-reports-05`): optimistic-concurrency token for update/enable/delete (`If-Match: "vN"`). */
  readonly version: number;
  readonly nextRunAt: string;
  readonly lastRunAt: string | null;
  readonly createdBy: { readonly id: string; readonly displayName: string } | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recipients: readonly { readonly id: string; readonly displayName: string; readonly email: string; readonly isActive: boolean }[];
  readonly lastRun: {
    readonly id: string;
    readonly status: string;
    readonly trigger: string;
    readonly createdAt: string;
    readonly sentCount: number;
    readonly recipientCount: number;
  } | null;
};

export type ReportScheduleRunView = {
  readonly id: string;
  readonly trigger: string;
  readonly status: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly recipientCount: number;
  readonly sentCount: number;
  readonly skipped: readonly { readonly userId: string; readonly reason: string; readonly displayName: string | null }[];
  readonly omittedAttachments: readonly { readonly pack: string; readonly reason: string }[];
  readonly errorCode: string | null;
  readonly durationMs: number | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
  readonly triggeredBy: { readonly id: string; readonly displayName: string } | null;
};

type Actor = { readonly principal: AuthorizationPrincipal; readonly requestId: string | null };

/** Paket 2.5 (§5.5): schedule administration (`reports.schedule.manage`). */
@Injectable()
export class ReportSchedulesService {
  private readonly logger = new Logger('ReportSchedules');

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: ReportSchedulesConfigurationLoader,
    private readonly reportsConfigurationLoader: ReportsConfigurationLoader,
    private readonly accessChecker: ReportAccessChecker,
    private readonly runner: ScheduledReportRunner,
    @Optional() @InjectQueue(reportSchedulesQueueName) private readonly queue?: Queue,
  ) {}

  async list(actor: Actor) {
    const configuration = await this.configurationLoader.load();
    await this.requireReports();
    const records = (await this.prisma.reportSchedule.findMany({
      select: reportScheduleSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })) as unknown as ReportScheduleRecord[];
    const visible = await this.filterAccessible(actor, records);
    const lastRuns = await this.loadLastRuns(visible.map((record) => record.id));
    const labels = await this.loadScopeLabels(actor, visible);
    return {
      schedules: visible.map((record) =>
        toView(record, lastRuns.get(record.id) ?? null, labels.get(record.id) ?? hiddenScopeLabels),
      ),
      settings: {
        enabled: configuration.enabled,
        maxSchedules: configuration.maxSchedules,
        maxRecipients: configuration.maxRecipients,
        defaultSendTime: configuration.defaultSendTime,
        attachmentMaxRows: configuration.attachmentMaxRows,
        timeZone: configuration.timeZone,
        total: records.length,
      },
      sections: reportScheduleSections,
      packs: (await this.reportsConfigurationLoader.load()).enabledPacks,
    };
  }

  async create(actor: Actor, input: SaveReportScheduleDto, now: Date = new Date()): Promise<ReportScheduleView> {
    const configuration = await this.requireScheduled();
    // Validation runs before the lock on purpose: it is the expensive part (authorization, scope lookups) and it
    // does not change the row count, so the lock is only held for the count and the insert.
    const data = await this.validate(actor, input, configuration);
    const enabled = input.enabled ?? true;
    // §6 (W7.94): the limit is checked *and* consumed inside one locked transaction — a plain count-then-create
    // lets two concurrent saves both pass a limit of N and land N+1 rows.
    const created = await this.prisma.$transaction(async (transaction) => {
      const row = await withReportScheduleLimit(transaction, configuration, () =>
        transaction.reportSchedule.create({
          data: {
            ...data.fields,
            enabled,
            nextRunAt: nextReportRunAt(
              data.fields.frequency,
              data.fields.sendTime,
              configuration.timeZone,
              now,
            ),
            createdByUserId: actor.principal.subjectId,
            recipients: { create: data.recipientIds.map((userId) => ({ userId })) },
          },
          select: { id: true },
        }),
      );
      // W7.96 (`BA-reports-06`): the audit row is appended by the same transaction as the schedule it describes.
      // A failing audit therefore rolls the schedule back instead of leaving a row nobody can account for.
      await this.auditIn(
        transaction,
        actor,
        auditLogActions.reportScheduleCreated,
        row.id,
        data.fields.organizationalUnitId,
        {
          name: data.fields.name,
          frequency: data.fields.frequency,
          sendTime: data.fields.sendTime,
          sections: data.fields.sections,
          packKeys: data.fields.packKeys,
          recipientCount: data.recipientIds.length,
          enabled,
        },
      );
      return row;
    });
    return this.get(actor, created.id);
  }

  async update(
    actor: Actor,
    id: string,
    input: SaveReportScheduleDto,
    expectedVersion: number,
    now: Date = new Date(),
  ): Promise<ReportScheduleView> {
    assertScheduleVersion(expectedVersion);
    const configuration = await this.requireScheduled();
    const existing = await this.requireAccessible(actor, id);
    const data = await this.validate(actor, input, configuration);
    const enabled = input.enabled ?? existing.enabled;
    const timingChanged =
      existing.frequency !== data.fields.frequency ||
      existing.sendTime !== data.fields.sendTime ||
      (!existing.enabled && enabled);
    await this.prisma.$transaction(async (transaction) => {
      // W7.95 (`BA-reports-05`): the version predicate *is* the check. A save based on a stale read matches no
      // row, so it writes neither the schedule nor the recipients — the editor sees 412 instead of silently
      // overwriting the change that landed in between.
      const updated = await transaction.reportSchedule.updateMany({
        where: { id, version: expectedVersion },
        data: {
          ...data.fields,
          enabled,
          updatedByUserId: actor.principal.subjectId,
          version: expectedVersion + 1,
          ...(timingChanged
            ? { nextRunAt: nextReportRunAt(data.fields.frequency, data.fields.sendTime, configuration.timeZone, now) }
            : {}),
        },
      });
      if (updated.count !== 1) throw await this.staleScheduleWrite(id);
      await transaction.reportScheduleRecipient.deleteMany({
        where: { scheduleId: id, userId: { notIn: data.recipientIds } },
      });
      await transaction.reportScheduleRecipient.createMany({
        data: data.recipientIds.map((userId) => ({ scheduleId: id, userId })),
        skipDuplicates: true,
      });
      // W7.96: the change and its audit row commit together — the before/after snapshot cannot describe a state
      // that was rolled back, and a rolled-back change cannot leave an audit row claiming it happened.
      await this.auditIn(
        transaction,
        actor,
        auditLogActions.reportScheduleUpdated,
        id,
        data.fields.organizationalUnitId,
        {
          changed: changedFields(existing, { ...data.fields, enabled }, data.recipientIds),
          recipientCount: data.recipientIds.length,
        },
      );
    });
    return this.get(actor, id);
  }

  async setEnabled(
    actor: Actor,
    id: string,
    enabled: boolean,
    expectedVersion: number,
    now: Date = new Date(),
  ): Promise<ReportScheduleView> {
    assertScheduleVersion(expectedVersion);
    const configuration = await this.requireScheduled();
    const existing = await this.requireAccessible(actor, id);
    // The token is checked even for a no-op toggle: an editor that is behind must learn it is behind, not be
    // told that its (already stale) picture of the switch is the current one.
    if (existing.version !== expectedVersion) throw await this.staleScheduleWrite(id);
    if (existing.enabled !== enabled) {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.reportSchedule.updateMany({
          where: { id, version: expectedVersion },
          data: {
            enabled,
            updatedByUserId: actor.principal.subjectId,
            version: expectedVersion + 1,
            ...(enabled
              ? { nextRunAt: nextReportRunAt(existing.frequency, existing.sendTime, configuration.timeZone, now) }
              : {}),
          },
        });
        if (updated.count !== 1) throw await this.staleScheduleWrite(id);
        await this.auditIn(
          transaction,
          actor,
          auditLogActions.reportScheduleUpdated,
          id,
          existing.organizationalUnitId,
          { changed: ['enabled'], enabled },
        );
      });
    }
    return this.get(actor, id);
  }

  async remove(actor: Actor, id: string, expectedVersion: number): Promise<void> {
    assertScheduleVersion(expectedVersion);
    await this.requireReports();
    const existing = await this.requireAccessible(actor, id);
    // W7.95: deleting a schedule somebody edited a second ago destroys work nobody meant to discard. The token
    // makes the client's "delete this" mean "delete the row I was shown".
    // W7.96: the delete and its audit row are one transaction, so a crash cannot leave a deletion that nobody
    // can trace, nor an audit row for a schedule that still exists.
    // W7.97: the run log does not follow the schedule into the cascade — `ReportScheduleRun.scheduleId` is set
    // to NULL and the run keeps its own name/OU snapshot until the 180-day retention prunes it.
    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.reportSchedule.deleteMany({
        where: { id, version: expectedVersion },
      });
      if (deleted.count !== 1) throw await this.staleScheduleWrite(id);
      await this.auditIn(
        transaction,
        actor,
        auditLogActions.reportScheduleDeleted,
        id,
        existing.organizationalUnitId,
        {
          name: existing.name,
          frequency: existing.frequency,
          recipientCount: existing.recipients.length,
        },
      );
    });
  }

  async get(actor: Actor, id: string): Promise<ReportScheduleView> {
    const record = await this.requireAccessible(actor, id);
    const lastRuns = await this.loadLastRuns([id]);
    const labels = await this.loadScopeLabels(actor, [record]);
    return toView(record, lastRuns.get(id) ?? null, labels.get(id) ?? hiddenScopeLabels);
  }

  async runs(actor: Actor, id: string): Promise<{ readonly runs: readonly ReportScheduleRunView[] }> {
    await this.requireAccessible(actor, id);
    const runs = await this.prisma.reportScheduleRun.findMany({
      where: { scheduleId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: reportScheduleLimits.runsListed,
    });
    const userIds = new Set<string>();
    for (const run of runs) {
      if (run.triggeredByUserId !== null) userIds.add(run.triggeredByUserId);
      for (const item of asArray(run.skipped)) {
        if (typeof item.userId === 'string') userIds.add(item.userId);
      }
    }
    const users = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, displayName: true },
        })
      ).map((user) => [user.id, user]),
    );
    return {
      runs: runs.map((run) => ({
        id: run.id,
        trigger: run.trigger,
        status: run.status,
        periodStart: run.periodStart.toISOString(),
        periodEnd: run.periodEnd.toISOString(),
        recipientCount: run.recipientCount,
        sentCount: run.sentCount,
        skipped: asArray(run.skipped).map((item) => ({
          userId: String(item.userId ?? ''),
          reason: String(item.reason ?? ''),
          displayName: users.get(String(item.userId ?? ''))?.displayName ?? null,
        })),
        omittedAttachments: asArray(run.omittedAttachments).map((item) => ({
          pack: String(item.pack ?? ''),
          reason: String(item.reason ?? ''),
        })),
        errorCode: run.errorCode,
        durationMs: run.durationMs,
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        triggeredBy: run.triggeredByUserId === null ? null : (users.get(run.triggeredByUserId) ?? null),
      })),
    };
  }

  async sendTest(actor: Actor, id: string): Promise<{ readonly sent: boolean; readonly reason?: string }> {
    await this.requireScheduled();
    const schedule = await this.requireAccessible(actor, id);
    const me = (await this.prisma.user.findUnique({
      where: { id: actor.principal.subjectId },
      select: { id: true, email: true, displayName: true, preferredLocale: true, isLocalOnly: true, isActive: true },
    })) as ReportRecipientUser | null;
    if (me === null) throw new ReportsError(reportErrorCodes.forbidden);
    const result = await this.runner.sendTest(schedule, me);
    if (result.sent) {
      await this.audit(actor, auditLogActions.reportScheduleTestSent, id, schedule.organizationalUnitId, {
        name: schedule.name,
      });
    }
    return result;
  }

  /** „Pošalji sada”: queued for the worker (SMTP to many recipients takes a while). */
  async runNow(actor: Actor, id: string): Promise<{ readonly queued: boolean }> {
    await this.requireScheduled();
    await this.requireAccessible(actor, id);
    if (this.queue === undefined) return { queued: false };
    await this.queue.add(
      reportSchedulesManualJobName,
      { scheduleId: id, actorUserId: actor.principal.subjectId },
      { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
    );
    return { queued: true };
  }

  async candidates(
    actor: Actor,
    organizationalUnitId: string,
    query: string,
  ): Promise<{ readonly users: readonly { readonly id: string; readonly displayName: string; readonly email: string }[] }> {
    await this.requireReports();
    await this.requireUnitAccess(actor, organizationalUnitId);
    const users = await this.accessChecker.candidates(organizationalUnitId, query, reportScheduleLimits.candidatesListed);
    return { users: users.map((user) => ({ id: user.id, displayName: user.displayName, email: user.email })) };
  }

  private async validate(actor: Actor, input: SaveReportScheduleDto, configuration: ReportSchedulesConfiguration) {
    const name = input.name.trim();
    if (name.length === 0) throw new ReportsError(reportErrorCodes.scheduleInvalid, { field: 'name' });
    await this.requireUnitAccess(actor, input.organizationalUnitId);
    const [unit, service, group] = await Promise.all([
      this.prisma.organizationalUnit.findUnique({
        where: { id: input.organizationalUnitId },
        select: { id: true, ouPath: true },
      }),
      input.serviceId === undefined
        ? Promise.resolve(null)
        : this.prisma.service.findUnique({ where: { id: input.serviceId }, select: { id: true } }),
      input.groupId === undefined
        ? Promise.resolve(null)
        : this.prisma.group.findUnique({
            where: { id: input.groupId },
            select: { id: true, organizationalUnit: { select: { ouPath: true } } },
          }),
    ]);
    if (unit === null) throw new ReportsError(reportErrorCodes.organizationalUnitNotFound);
    // W7.93 (`BA-reports-03`): existence was never the whole question. A schedule is anchored to one unit
    // and the filters must stay inside it: the service has to be one the actor may use, and the group has to
    // live in the unit's subtree. Unknown and foreign answer with the *same* code and field, so the response
    // cannot be used to learn which ids exist.
    if (input.serviceId !== undefined) {
      const usable =
        service !== null &&
        (await this.accessChecker.canUseScheduleService(
          actor.principal,
          input.organizationalUnitId,
          input.serviceId,
        ));
      if (!usable) {
        throw new ReportsError(reportErrorCodes.scheduleScopeInvalid, { field: 'serviceId' });
      }
    }
    if (input.groupId !== undefined) {
      const inSubtree =
        group !== null &&
        isGroupWithinUnitSubtree({
          scopeUnitPath: unit.ouPath,
          groupUnitPath: group.organizationalUnit.ouPath,
        });
      if (!inSubtree) {
        throw new ReportsError(reportErrorCodes.scheduleScopeInvalid, { field: 'groupId' });
      }
    }
    const reports = await this.reportsConfigurationLoader.load();
    const disabledPacks = input.packKeys.filter((key) => !reports.enabledPacks.includes(key as ReportPackKey));
    if (disabledPacks.length > 0) {
      throw new ReportsError(reportErrorCodes.scheduleInvalid, { field: 'packKeys', packKeys: disabledPacks });
    }
    const recipientIds = [...new Set(input.recipientUserIds)];
    if (recipientIds.length > configuration.maxRecipients) {
      throw new ReportsError(reportErrorCodes.recipientLimit, { max: configuration.maxRecipients });
    }
    // §5.2: only internal users with access to the unit's reports.
    const verdicts = await this.accessChecker.evaluate(recipientIds, input.organizationalUnitId);
    const rejected = verdicts.filter((verdict) => !verdict.ok);
    if (rejected.length > 0) {
      throw new ReportsError(reportErrorCodes.recipientInvalid, {
        userIds: rejected.map((verdict) => (verdict.ok ? '' : verdict.userId)),
      });
    }
    const sections = reportScheduleSections.filter((section) => input.sections.includes(section));
    return {
      fields: {
        name,
        frequency: input.frequency,
        sendTime: input.sendTime,
        organizationalUnitId: input.organizationalUnitId,
        serviceId: input.serviceId ?? null,
        groupId: input.groupId ?? null,
        priority: input.priority ?? null,
        sections,
        packKeys: [...input.packKeys],
      },
      recipientIds,
    };
  }

  /**
   * Classifies a lost CAS. A row that vanished answers the same 404 the rest of the module uses; a row that moved
   * on answers 412 with the version the caller has to reload.
   */
  private async staleScheduleWrite(id: string): Promise<ReportsError | OptimisticConcurrencyError> {
    const current = await this.prisma.reportSchedule.findUnique({
      where: { id },
      select: { version: true },
    });
    if (current === null) return new ReportsError(reportErrorCodes.scheduleNotFound);
    return new OptimisticConcurrencyError(
      optimisticConcurrencyErrorCodes.staleWrite,
      412,
      formatVersionEtag(current.version),
    );
  }

  private async requireAccessible(actor: Actor, id: string): Promise<ReportScheduleRecord> {
    const record = (await this.prisma.reportSchedule.findUnique({
      where: { id },
      select: reportScheduleSelect,
    })) as unknown as ReportScheduleRecord | null;
    // A schedule outside the actor's units is reported as missing, not forbidden.
    if (record === null || !(await this.accessChecker.canAccess(actor.principal, record.organizationalUnitId))) {
      throw new ReportsError(reportErrorCodes.scheduleNotFound);
    }
    return record;
  }

  private async requireUnitAccess(actor: Actor, organizationalUnitId: string): Promise<void> {
    if (!(await this.accessChecker.canAccess(actor.principal, organizationalUnitId))) {
      throw new ReportsError(reportErrorCodes.forbidden);
    }
  }

  private async filterAccessible(actor: Actor, records: readonly ReportScheduleRecord[]) {
    const decisions = new Map<string, boolean>();
    for (const unitId of new Set(records.map((record) => record.organizationalUnitId))) {
      decisions.set(unitId, await this.accessChecker.canAccess(actor.principal, unitId));
    }
    return records.filter((record) => decisions.get(record.organizationalUnitId) === true);
  }

  /**
   * W7.93 (`BA-reports-03`): rows saved before this package may already point at a foreign group or a
   * service the reader cannot use. Both names are dropped instead of printed: a stale filter is not a fact
   * worth disclosing to the unit's admins. The worker applies the same rule before composing the e-mail
   * scope line, so a legacy row cannot leak a name by mail either.
   */
  private async loadScopeLabels(
    actor: Actor,
    records: readonly ReportScheduleRecord[],
  ): Promise<Map<string, ScheduleScopeLabels>> {
    const labels = new Map<string, ScheduleScopeLabels>();
    if (records.length === 0) return labels;
    const groupIds = [
      ...new Set(records.map((record) => record.groupId).filter((id): id is string => id !== null)),
    ];
    const [units, groups] = await Promise.all([
      this.prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true } }),
      groupIds.length === 0
        ? Promise.resolve([] as { id: string; organizationalUnitId: string }[])
        : this.prisma.group.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, organizationalUnitId: true },
          }),
    ]);
    const unitPaths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
    const groupUnitIds = new Map(groups.map((group) => [group.id, group.organizationalUnitId]));
    const serviceVerdicts = new Map<string, boolean>();
    for (const record of records) {
      if (record.serviceId === null || serviceVerdicts.has(record.serviceId)) continue;
      serviceVerdicts.set(
        record.serviceId,
        await this.accessChecker.canUseScheduleService(
          actor.principal,
          record.organizationalUnitId,
          record.serviceId,
        ),
      );
    }
    for (const record of records) {
      const groupUnitId = record.groupId === null ? null : (groupUnitIds.get(record.groupId) ?? null);
      const groupInSubtree =
        groupUnitId !== null &&
        isGroupWithinUnitSubtree({
          scopeUnitPath: unitPaths.get(record.organizationalUnitId) ?? null,
          groupUnitPath: unitPaths.get(groupUnitId) ?? null,
        });
      if (record.groupId !== null && !groupInSubtree) {
        this.logger.warn(
          `report_schedule_scope_outside_subtree schedule=${record.id} group=${record.groupId}`,
        );
      }
      labels.set(record.id, {
        showService: record.serviceId === null || serviceVerdicts.get(record.serviceId) === true,
        showGroup: record.groupId === null || groupInSubtree,
      });
    }
    return labels;
  }

  private async loadLastRuns(scheduleIds: readonly string[]) {
    const result = new Map<string, NonNullable<ReportScheduleView['lastRun']>>();
    if (scheduleIds.length === 0) return result;
    const runs = await this.prisma.reportScheduleRun.findMany({
      where: { scheduleId: { in: [...scheduleIds] } },
      distinct: ['scheduleId'],
      orderBy: [{ scheduleId: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, scheduleId: true, status: true, trigger: true, createdAt: true, sentCount: true, recipientCount: true },
    });
    for (const run of runs) {
      // W7.97: runs outlive their schedule (tombstone), so they are not always attributable to a live row here.
      if (run.scheduleId === null) continue;
      result.set(run.scheduleId, {
        id: run.id,
        status: run.status,
        trigger: run.trigger,
        createdAt: run.createdAt.toISOString(),
        sentCount: run.sentCount,
        recipientCount: run.recipientCount,
      });
    }
    return result;
  }

  private async requireReports(): Promise<void> {
    const reports = await this.reportsConfigurationLoader.load();
    if (!reports.reportsEnabled || !reports.addonEnabled) {
      throw new ReportsError(reportErrorCodes.disabled);
    }
  }

  private async requireScheduled(): Promise<ReportSchedulesConfiguration> {
    await this.requireReports();
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled) throw new ReportsError(reportErrorCodes.scheduleDisabled);
    return configuration;
  }

  /**
   * W7.96 (`BA-reports-06`): the audit entry of a schedule mutation is written by the mutation's own transaction
   * (see `auditIn`). Only effects that happen *outside* the database — sending a test e-mail — still use a
   * standalone write, because there is nothing to commit them with.
   */
  private async audit(
    actor: Actor,
    action: string,
    scheduleId: string,
    organizationalUnitId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordAuditEntry(this.prisma, this.auditInput(actor, action, scheduleId, organizationalUnitId, metadata));
  }

  private async auditIn(
    transaction: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    scheduleId: string,
    organizationalUnitId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordAuditEntry(
      transaction,
      this.auditInput(actor, action, scheduleId, organizationalUnitId, metadata),
    );
  }

  private auditInput(
    actor: Actor,
    action: string,
    scheduleId: string,
    organizationalUnitId: string,
    metadata: Record<string, unknown>,
  ): RecordAuditEntryInput {
    return {
      action,
      entityType: auditLogEntityTypes.reportSchedule,
      entityId: scheduleId,
      metadata: metadata as never,
      actorUserId: actor.principal.subjectId,
      requestId: actor.requestId,
      organizationalUnitId,
    };
  }
}

/** W7.93: which stored reference names a reader is allowed to see. */
type ScheduleScopeLabels = { readonly showService: boolean; readonly showGroup: boolean };

const hiddenScopeLabels: ScheduleScopeLabels = { showService: false, showGroup: false };

/**
 * W7.95: the version predicate must never be silently absent. If `expectedVersion` were `undefined`, Prisma would
 * drop `version` from the `where` clause and the CAS would degrade back into an unconditional write — the exact
 * bug this package removes. The controller parses `If-Match` first; this is the second line of defence.
 */
function assertScheduleVersion(expectedVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new OptimisticConcurrencyError(optimisticConcurrencyErrorCodes.invalidIfMatch, 400);
  }
}

function toView(
  record: ReportScheduleRecord,
  lastRun: ReportScheduleView['lastRun'],
  labels: ScheduleScopeLabels,
): ReportScheduleView {
  return {
    id: record.id,
    name: record.name,
    frequency: record.frequency,
    sendTime: record.sendTime,
    organizationalUnit: record.organizationalUnit,
    service: labels.showService ? record.service : null,
    group: labels.showGroup ? record.group : null,
    priority: record.priority,
    sections: record.sections,
    packKeys: record.packKeys,
    enabled: record.enabled,
    version: record.version,
    nextRunAt: record.nextRunAt.toISOString(),
    lastRunAt: record.lastRunAt?.toISOString() ?? null,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    recipients: record.recipients.map((recipient) => recipient.user),
    lastRun,
  };
}

function changedFields(
  before: ReportScheduleRecord,
  after: Record<string, unknown>,
  recipientIds: readonly string[],
): string[] {
  const changed: string[] = [];
  for (const key of ['name', 'frequency', 'sendTime', 'organizationalUnitId', 'serviceId', 'groupId', 'priority', 'enabled']) {
    if ((before as unknown as Record<string, unknown>)[key] !== after[key]) changed.push(key);
  }
  const same = (left: readonly string[], right: readonly unknown[]) =>
    left.length === right.length && left.every((value) => right.includes(value));
  if (!same(before.sections, after.sections as unknown[])) changed.push('sections');
  if (!same(before.packKeys, after.packKeys as unknown[])) changed.push('packKeys');
  if (!same(before.recipients.map((recipient) => recipient.userId), recipientIds)) changed.push('recipients');
  return changed;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
}
