import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { permissionKeys } from '../authorization/authorization.constants';
import { recordServiceCatalogChange, serviceDowntimeWindowChangeLogEntityType } from '../service-catalog/record-service-catalog-change';
import { serviceAvailabilityChangeLogReasons, serviceAvailabilityConstants } from '../service-catalog/service-availability.constants';
import { ServiceAvailabilityConfigurationLoader } from '../service-catalog/service-availability-configuration.loader';
import { ChangeAccessService, type ChangeConfiguration, type ChangeViewer } from './change-access.service';
import {
  detectChangeConflicts,
  planChangeDowntime,
  planDowntimeRelease,
  type ChangeConflicts,
  type ConflictWindow,
  type DowntimePlan,
} from './change-conflicts';
import { assertChangeWindow, formatChangeNumber } from './change-rules';
import { changeVisibilityWhere } from './change-visibility';
import {
  ChangeError,
  changeActiveWindowStatuses,
  changeErrorCodes,
  changeEventActions,
  changeLimits,
  type ChangeStatusValue,
  type ChangeTypeValue,
} from './changes.constants';

/** Statuses shown in the calendar (drafts and dead ends stay out). */
const calendarStatuses: readonly ChangeStatusValue[] = ['ASSESSMENT', 'AUTHORIZATION', 'SCHEDULED', 'IMPLEMENTING', 'REVIEW', 'CLOSED'];

function downtimeReleaseReason(status: ChangeStatusValue): string {
  switch (status) {
    case 'CANCELLED':
      return 'cancel';
    case 'REVIEW':
      return 'finish';
    case 'AUTHORIZATION':
      return 'reschedule';
    default:
      return 'not_applicable';
  }
}

export type ConflictSubject = {
  readonly changeId: string | null;
  readonly type: ChangeTypeValue;
  readonly window: ConflictWindow;
  readonly serviceIds: readonly string[];
  readonly assetIds: readonly string[];
};

/**
 * Paket 3.4 (§9, §10, §17): conflicts, the change calendar and the downtime
 * windows a scheduled change owns. Lifecycle writes enqueue desired-state
 * sync in the same transaction; the worker retries failures through the outbox.
 */
@Injectable()
export class ChangeScheduleService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChangeAccessService,
    @Optional() private readonly availability?: ServiceAvailabilityConfigurationLoader,
  ) {}

  async conflictsFor(subject: ConflictSubject, configuration: ChangeConfiguration): Promise<ChangeConflicts> {
    const { window } = subject;
    const [candidates, downtime] = await Promise.all([
      subject.serviceIds.length + subject.assetIds.length === 0
        ? []
        : this.prisma.changeRequest.findMany({
            where: {
              status: { in: [...changeActiveWindowStatuses] },
              plannedStart: { lt: window.end },
              plannedEnd: { gt: window.start },
              OR: [
                ...(subject.serviceIds.length > 0 ? [{ services: { some: { serviceId: { in: [...subject.serviceIds] } } } }] : []),
                ...(subject.assetIds.length > 0 ? [{ assets: { some: { assetId: { in: [...subject.assetIds] } } } }] : []),
              ],
            },
            select: {
              id: true,
              sequence: true,
              title: true,
              status: true,
              plannedStart: true,
              plannedEnd: true,
              services: { select: { serviceId: true } },
              assets: { select: { assetId: true } },
            },
            take: 200,
          }),
      subject.serviceIds.length === 0
        ? []
        : this.prisma.serviceDowntimeWindow.findMany({
            where: { serviceId: { in: [...subject.serviceIds] }, startsAt: { lt: window.end }, endsAt: { gt: window.start } },
            select: { id: true, serviceId: true, startsAt: true, endsAt: true, message: true, changeRequestId: true },
            take: 200,
          }),
    ]);
    return detectChangeConflicts({
      changeId: subject.changeId,
      type: subject.type,
      window,
      serviceIds: subject.serviceIds,
      assetIds: subject.assetIds,
      candidates: candidates.map((row) => ({
        id: row.id,
        sequence: row.sequence,
        title: row.title,
        status: row.status,
        start: row.plannedStart as Date,
        end: row.plannedEnd as Date,
        serviceIds: row.services.map((link) => link.serviceId),
        assetIds: row.assets.map((link) => link.assetId),
      })),
      downtime,
      freezePeriods: configuration.freezePeriods,
      timeZone: configuration.timeZone,
    });
  }

  /** API shape of the conflicts (numbers, service names) for the detail and the form. */
  async describe(conflicts: ChangeConflicts, configuration: ChangeConfiguration) {
    const serviceIds = [...new Set([...conflicts.downtime.map((item) => item.serviceId), ...conflicts.changes.flatMap((item) => item.sharedServiceIds)])];
    const services = serviceIds.length === 0 ? [] : await this.prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } });
    const serviceName = new Map(services.map((service) => [service.id, service.name]));
    return {
      changes: conflicts.changes.map((item) => ({
        id: item.id,
        number: formatChangeNumber(configuration.numberPrefix, item.sequence),
        title: item.title,
        status: item.status,
        plannedStart: item.start.toISOString(),
        plannedEnd: item.end.toISOString(),
        sharedServices: item.sharedServiceIds.map((id) => ({ id, name: serviceName.get(id) ?? id })),
        sharedAssetCount: item.sharedAssetIds.length,
      })),
      downtime: conflicts.downtime.map((item) => ({
        id: item.id,
        service: { id: item.serviceId, name: serviceName.get(item.serviceId) ?? item.serviceId },
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        message: item.message,
        changeRequestId: item.changeRequestId,
      })),
      freeze: conflicts.freeze,
      freezeBlocks: conflicts.freezeBlocks,
      hasWarnings: conflicts.changes.length > 0 || conflicts.downtime.length > 0 || (conflicts.freeze !== null && !conflicts.freezeBlocks),
    };
  }

  /** §17 form: conflicts of an unsaved window. */
  async preview(
    viewer: ChangeViewer,
    input: { type: ChangeTypeValue; plannedStart: string; plannedEnd: string; serviceIds?: string[]; assetIds?: string[]; changeId?: string },
  ) {
    await this.access.require(viewer, permissionKeys.changeRead);
    const configuration = await this.access.configuration();
    const start = new Date(input.plannedStart);
    const end = new Date(input.plannedEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new ChangeError(changeErrorCodes.validation, 'date');
    assertChangeWindow(start, end);
    const conflicts = await this.conflictsFor(
      {
        changeId: input.changeId ?? null,
        type: input.type,
        window: { start, end },
        serviceIds: [...new Set(input.serviceIds ?? [])].slice(0, changeLimits.linksMax),
        assetIds: [...new Set(input.assetIds ?? [])].slice(0, changeLimits.linksMax),
      },
      configuration,
    );
    return this.describe(conflicts, configuration);
  }

  /** §17: changes, downtime windows and freezes in a period (at most 62 days). */
  async calendar(viewer: ChangeViewer, fromRaw: string | undefined, toRaw: string | undefined) {
    const scope = await this.access.require(viewer, permissionKeys.changeRead);
    const configuration = await this.access.configuration();
    const from = new Date(fromRaw ?? '');
    const to = new Date(toRaw ?? '');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() >= to.getTime()) {
      throw new ChangeError(changeErrorCodes.validation, 'period');
    }
    if (to.getTime() - from.getTime() > changeLimits.calendarMaxDays * 86_400_000) throw new ChangeError(changeErrorCodes.validation, 'period');
    const visible = changeVisibilityWhere(scope, viewer.userId);
    const where: Prisma.ChangeRequestWhereInput = {
      status: { in: [...calendarStatuses] },
      plannedStart: { lt: to },
      plannedEnd: { gt: from },
      ...(visible === null ? {} : { AND: [visible] }),
    };
    const [changes, downtime] = await Promise.all([
      this.prisma.changeRequest.findMany({
        where,
        select: {
          id: true,
          sequence: true,
          title: true,
          type: true,
          status: true,
          risk: true,
          plannedStart: true,
          plannedEnd: true,
          causesDowntime: true,
          services: { select: { service: { select: { id: true, name: true } } }, take: 5 },
        },
        orderBy: [{ plannedStart: 'asc' }, { id: 'asc' }],
        take: changeLimits.calendarMaxItems,
      }),
      this.prisma.serviceDowntimeWindow.findMany({
        where: { startsAt: { lt: to }, endsAt: { gt: from } },
        select: { id: true, startsAt: true, endsAt: true, message: true, changeRequestId: true, service: { select: { id: true, name: true } } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: changeLimits.calendarMaxItems,
      }),
    ]);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timeZone: configuration.timeZone,
      changes: changes.map((row) => ({
        id: row.id,
        number: formatChangeNumber(configuration.numberPrefix, row.sequence),
        title: row.title,
        type: row.type,
        status: row.status,
        risk: row.risk,
        plannedStart: (row.plannedStart as Date).toISOString(),
        plannedEnd: (row.plannedEnd as Date).toISOString(),
        causesDowntime: row.causesDowntime,
        services: row.services.map((link) => link.service),
      })),
      downtime: downtime.map((row) => ({
        id: row.id,
        service: row.service,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        message: row.message,
        changeRequestId: row.changeRequestId,
      })),
      freezePeriods: configuration.freezePeriods,
      truncated: changes.length >= changeLimits.calendarMaxItems || downtime.length >= changeLimits.calendarMaxItems,
    };
  }

  private async downtimeEnabled(): Promise<boolean> {
    if (this.availability === undefined) return false;
    return (await this.availability.load()).downtime.enabled;
  }

  /**
   * Read-only drift check used by the periodic reconciler. A blocked foreign
   * overlap is an acknowledged plan outcome, not missing desired state.
   */
  async hasDowntimeDrift(changeId: string): Promise<boolean> {
    const change = await this.prisma.changeRequest.findUnique({
      where: { id: changeId },
      select: {
        status: true,
        causesDowntime: true,
        plannedStart: true,
        plannedEnd: true,
        services: { select: { serviceId: true } },
        downtimeWindows: { select: { id: true, serviceId: true, startsAt: true, endsAt: true } },
      },
    });
    if (change === null) return false;
    const own = change.downtimeWindows;
    const active = change.status === 'SCHEDULED' || change.status === 'IMPLEMENTING';
    if (!active || !change.causesDowntime || change.plannedStart === null || change.plannedEnd === null) {
      return this.releaseHasChanges(own);
    }
    if (!(await this.downtimeEnabled())) return this.releaseHasChanges(own);

    const serviceIds = change.services.map((link) => link.serviceId);
    const foreign =
      serviceIds.length === 0
        ? []
        : await this.prisma.serviceDowntimeWindow.findMany({
            where: { serviceId: { in: serviceIds }, OR: [{ changeRequestId: null }, { changeRequestId: { not: changeId } }] },
            select: { serviceId: true, startsAt: true, endsAt: true },
          });
    const plan = planChangeDowntime({
      window: { start: change.plannedStart, end: change.plannedEnd },
      serviceIds,
      own,
      foreign,
    });
    return plan.create.length + plan.update.length + plan.delete.length > 0;
  }

  /**
   * §10: recompute and apply the latest desired state. Errors deliberately
   * propagate to the transactional outbox so retry/dead-letter state is durable.
   */
  async syncDowntime(
    changeId: string,
    actorUserId: string | null,
    commandKey?: string,
  ): Promise<void> {
    const enabled = await this.downtimeEnabled();
    const configuration = enabled ? await this.access.configuration() : null;
    await this.prisma.$transaction(async (transaction) => {
      await this.acquireChangeLock(transaction, changeId);
      const change = await transaction.changeRequest.findUnique({
        where: { id: changeId },
        select: {
          sequence: true,
          title: true,
          status: true,
          causesDowntime: true,
          plannedStart: true,
          plannedEnd: true,
          services: { select: { serviceId: true } },
          downtimeWindows: { select: { id: true, serviceId: true, startsAt: true, endsAt: true } },
        },
      });
      if (change === null) return;
      const own = change.downtimeWindows;
      const active = change.status === 'SCHEDULED' || change.status === 'IMPLEMENTING';
      if (!active || change.plannedStart === null || change.plannedEnd === null) {
        if (own.length > 0) {
          const reason = downtimeReleaseReason(change.status);
          await this.apply(
            transaction,
            changeId,
            actorUserId,
            planDowntimeRelease(own, new Date()),
            '',
            reason,
            null,
            commandKey,
          );
        }
        return;
      }
      if (!change.causesDowntime) {
        if (own.length > 0) {
          await this.apply(
            transaction,
            changeId,
            actorUserId,
            planDowntimeRelease(own, new Date()),
            '',
            'scheduled',
            null,
            commandKey,
          );
        }
        return;
      }
      if (!enabled) {
        if (own.length > 0) {
          await this.apply(
            transaction,
            changeId,
            actorUserId,
            planDowntimeRelease(own, new Date()),
            '',
            'downtime_disabled',
            null,
            commandKey,
          );
        } else {
          await this.event(
            transaction,
            changeId,
            actorUserId,
            { skipped: 'downtime_disabled' },
            commandKey,
          );
        }
        return;
      }

      const window = { start: change.plannedStart, end: change.plannedEnd };
      const serviceIds = change.services.map((link) => link.serviceId);
      const foreign =
        serviceIds.length === 0
          ? []
          : await transaction.serviceDowntimeWindow.findMany({
              where: { serviceId: { in: serviceIds }, OR: [{ changeRequestId: null }, { changeRequestId: { not: changeId } }] },
              select: { serviceId: true, startsAt: true, endsAt: true },
            });
      const message = `${formatChangeNumber(configuration!.numberPrefix, change.sequence)}: ${change.title}`.slice(0, serviceAvailabilityConstants.maximumMessageLength);
      await this.apply(
        transaction,
        changeId,
        actorUserId,
        planChangeDowntime({ window, serviceIds, own, foreign }),
        message,
        'scheduled',
        window,
        commandKey,
      );
    });
  }

  private releaseHasChanges(own: readonly { id: string; serviceId: string; startsAt: Date; endsAt: Date }[]): boolean {
    const plan = planDowntimeRelease(own, new Date());
    return plan.update.length + plan.delete.length > 0;
  }

  private async acquireChangeLock(transaction: Prisma.TransactionClient, changeId: string): Promise<void> {
    await transaction.$queryRaw`SELECT "id" FROM "ChangeRequest" WHERE "id" = ${changeId} FOR UPDATE`;
  }

  private async apply(
    transaction: Prisma.TransactionClient,
    changeId: string,
    actorUserId: string | null,
    plan: DowntimePlan,
    message: string,
    reason = 'scheduled',
    window: ConflictWindow | null = null,
    commandKey?: string,
  ): Promise<void> {
    const hasOperations = plan.create.length + plan.update.length + plan.delete.length > 0;
    if (!hasOperations && plan.skipped.length === 0) return;
    if (
      !hasOperations &&
      commandKey !== undefined &&
      (await this.hasDowntimeCommandEvent(transaction, changeId, commandKey))
    ) {
      return;
    }
    const client = transaction as unknown as PrismaService;
    const entityType = serviceDowntimeWindowChangeLogEntityType();
    if (window !== null) {
      for (const serviceId of plan.create) {
        const created = await transaction.serviceDowntimeWindow.create({
          data: { serviceId, startsAt: window.start, endsAt: window.end, message, changeRequestId: changeId },
          select: { id: true },
        });
        await recordServiceCatalogChange(client, {
          entityType,
          entityId: created.id,
          reason: serviceAvailabilityChangeLogReasons.downtimeWindowCreate,
          diff: { action: serviceAvailabilityChangeLogReasons.downtimeWindowCreate, serviceId, changeRequestId: changeId, after: { startsAt: window.start.toISOString(), endsAt: window.end.toISOString(), message } },
          actorUserId,
        });
      }
    }
    for (const item of plan.update) {
      await transaction.serviceDowntimeWindow.update({
        where: { id: item.id },
        data: { startsAt: item.startsAt, endsAt: item.endsAt, ...(message.length > 0 ? { message } : {}) },
      });
      await recordServiceCatalogChange(client, {
        entityType,
        entityId: item.id,
        reason: serviceAvailabilityChangeLogReasons.downtimeWindowUpdate,
        diff: { action: serviceAvailabilityChangeLogReasons.downtimeWindowUpdate, changeRequestId: changeId, after: { startsAt: item.startsAt.toISOString(), endsAt: item.endsAt.toISOString() } },
        actorUserId,
      });
    }
    if (plan.delete.length > 0) {
      await transaction.serviceDowntimeWindow.deleteMany({ where: { id: { in: [...plan.delete] }, changeRequestId: changeId } });
      for (const id of plan.delete) {
        await recordServiceCatalogChange(client, {
          entityType,
          entityId: id,
          reason: serviceAvailabilityChangeLogReasons.downtimeWindowDelete,
          diff: { action: serviceAvailabilityChangeLogReasons.downtimeWindowDelete, changeRequestId: changeId },
          actorUserId,
        });
      }
    }
    await transaction.changeEvent.create({
      data: {
        changeId,
        action: changeEventActions.downtime,
        actorUserId,
        detail: {
          reason,
          created: window === null ? 0 : plan.create.length,
          updated: plan.update.length,
          deleted: plan.delete.length,
          skippedServiceIds: [...plan.skipped],
          ...(commandKey === undefined ? {} : { outboxDedupeKey: commandKey }),
        } as never,
      },
    });
  }

  private async hasDowntimeCommandEvent(
    transaction: Prisma.TransactionClient,
    changeId: string,
    commandKey: string,
  ): Promise<boolean> {
    const existing = await transaction.changeEvent.findFirst({
      where: {
        changeId,
        action: changeEventActions.downtime,
        detail: { path: ['outboxDedupeKey'], equals: commandKey },
      },
      select: { id: true },
    });
    return existing !== null;
  }

  private async event(
    transaction: Prisma.TransactionClient,
    changeId: string,
    actorUserId: string | null,
    detail: Record<string, unknown>,
    commandKey?: string,
  ): Promise<void> {
    if (
      commandKey !== undefined &&
      (await this.hasDowntimeCommandEvent(transaction, changeId, commandKey))
    ) {
      return;
    }
    await transaction.changeEvent.create({
      data: {
        changeId,
        action: changeEventActions.downtime,
        actorUserId,
        detail: {
          ...detail,
          ...(commandKey === undefined ? {} : { outboxDedupeKey: commandKey }),
        } as never,
      },
    });
  }
}
