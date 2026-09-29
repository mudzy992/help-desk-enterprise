import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { appendAuditLog } from '../audit-log/append-audit-log';
import type { AuditLogTransactionalClient, AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import type { JsonValue } from '../change-log/change-log.types';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTitleKeys, notificationTypes, type NotificationType } from '../notifications/notifications.constants';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { buildOnCallIcal } from './build-on-call-ical';
import {
  listContextSegments,
  loadActiveOnCallContexts,
  loadOnCallScheduleContext,
  resolveContextAt,
} from './on-call-data';
import { OnCallError, onCallErrorCodes, onCallLimits } from './on-call.constants';
import { formatOnCallTime, onCallText, toOnCallLocale, type OnCallLocale } from './on-call-text';
import type { OnCallViewer } from './on-call-viewer';
import { overridesOverlap, parseCivilDate, type OnCallSegment } from './resolve-on-call';

const dayMs = 86_400_000;
const staffRoleKeys = [authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin];

export type SaveOnCallScheduleInput = {
  readonly timezone: string;
  readonly handoffTime: string;
  readonly rotationLength: 'DAY' | 'WEEK';
  readonly rotationStartDate: string;
  readonly isActive: boolean;
  readonly autoAssignOutsideHours: boolean;
  readonly ownerUserId: string | null;
  readonly memberUserIds: readonly string[];
  readonly reason: string;
};

export type OnCallRangeInput = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
};

type UserName = { readonly id: string; readonly displayName: string; readonly isAvailable: boolean };

export function hashCalendarToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function parseHandoffTime(value: string): number {
  const match = /^([01]\d|2[0-3]):(00|15|30|45)$/.exec(value);
  if (match === null) throw new OnCallError(onCallErrorCodes.invalidSchedule, 'handoffTime');
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatHandoffTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function assertTimeZone(value: string): string {
  const zone = value.trim();
  try {
    if (zone.length === 0 || zone.length > 64) throw new Error('empty');
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
  } catch {
    throw new OnCallError(onCallErrorCodes.invalidSchedule, 'timezone');
  }
  return zone;
}

function parseInstant(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new OnCallError(onCallErrorCodes.invalidRange, field);
  return date;
}

function requireReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500) throw new OnCallError(onCallErrorCodes.invalidRange, 'reason');
  return reason;
}

/**
 * Paket 2.9 (K3): on-call schedules. Reads are cheap (a schedule is a handful
 * of rows; shifts are computed), writes are audited, and every write keeps
 * the invariants the resolver relies on (unique positions, no overlapping
 * overrides, members are active staff of the group).
 */
@Injectable()
export class OnCallService {
  private readonly logger = new Logger(OnCallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async isEnabled(): Promise<boolean> {
    try {
      return (await this.settings.getSetting(settingKeys.privateOnCallEnabled)) === true;
    } catch {
      return false;
    }
  }

  async requireEnabled(): Promise<void> {
    if (!(await this.isEnabled())) throw new OnCallError(onCallErrorCodes.disabled);
  }

  // ---------------------------------------------------------------- reads

  async overview(viewer: OnCallViewer) {
    await this.requireEnabled();
    const now = new Date();
    const [schedules, groups] = await Promise.all([
      this.prisma.onCallSchedule.findMany({ select: { groupId: true, isActive: true } }),
      this.prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const contexts = await loadActiveOnCallContexts(this.prisma, { from: now, to: new Date(now.getTime() + 1) });
    const currentByGroup = new Map(contexts.map((context) => [context.groupId, resolveContextAt(context, now)]));
    const names = await this.loadNames([...currentByGroup.values()].map((segment) => segment.userId));
    const scheduleByGroup = new Map(schedules.map((schedule) => [schedule.groupId, schedule]));
    return {
      canManage: viewer.canManage,
      groups: groups
        .filter((group) => viewer.canManage || scheduleByGroup.has(group.id))
        .map((group) => {
          const schedule = scheduleByGroup.get(group.id);
          const current = currentByGroup.get(group.id);
          return {
            groupId: group.id,
            groupName: group.name,
            hasSchedule: schedule !== undefined,
            isActive: schedule?.isActive ?? false,
            current:
              current === undefined || current.userId === null
                ? null
                : {
                    userId: current.userId,
                    displayName: names.get(current.userId)?.displayName ?? '',
                    source: current.source,
                    endsAt: current.endsAt.toISOString(),
                  },
          };
        }),
    };
  }

  async detail(groupId: string, range: { readonly from?: string; readonly to?: string }, viewer: OnCallViewer) {
    await this.requireEnabled();
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true } });
    if (group === null) throw new OnCallError(onCallErrorCodes.groupNotFound);
    const now = new Date();
    const from = range.from ? parseInstant(range.from, 'from') : new Date(now.getTime() - 7 * dayMs);
    const to = range.to ? parseInstant(range.to, 'to') : new Date(from.getTime() + 35 * dayMs);
    if (to.getTime() <= from.getTime() || to.getTime() - from.getTime() > onCallLimits.maxRangeDays * dayMs) {
      throw new OnCallError(onCallErrorCodes.invalidRange, 'range');
    }
    const schedule = await this.prisma.onCallSchedule.findUnique({
      where: { groupId },
      select: {
        id: true,
        timezone: true,
        handoffMinute: true,
        rotationLength: true,
        rotationStartDate: true,
        isActive: true,
        autoAssignOutsideHours: true,
        ownerUserId: true,
        members: { select: { userId: true, position: true }, orderBy: { position: 'asc' } },
      },
    });
    const candidates = viewer.canManage ? await this.listEligibleMembers(groupId) : [];
    if (schedule === null) {
      return {
        group,
        schedule: null,
        segments: [],
        current: null,
        overrides: [],
        swaps: [],
        candidates,
        defaultTimezone: await readInstallationTimeZone(this.settings),
        canManage: viewer.canManage,
      };
    }
    const context = await loadOnCallScheduleContext(this.prisma, groupId, {
      from: new Date(Math.min(from.getTime(), now.getTime())),
      to: new Date(Math.max(to.getTime(), now.getTime() + onCallLimits.maxAheadDays * dayMs)),
    });
    const segments = context === null ? [] : listContextSegments(context, from, to);
    const current = context === null ? null : resolveContextAt(context, now);
    const [overrides, swaps] = await Promise.all([
      this.prisma.onCallOverride.findMany({
        where: { scheduleId: schedule.id, endsAt: { gt: new Date(Math.min(from.getTime(), now.getTime())) } },
        orderBy: { startsAt: 'asc' },
        take: 200,
        select: { id: true, userId: true, startsAt: true, endsAt: true, reason: true, swapRequestId: true, createdAt: true },
      }),
      this.prisma.onCallSwapRequest.findMany({
        where: { scheduleId: schedule.id, status: 'PENDING', endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        take: 100,
        select: { id: true, requesterId: true, colleagueId: true, startsAt: true, endsAt: true, reason: true, createdAt: true },
      }),
    ]);
    const names = await this.loadNames([
      ...schedule.members.map((member) => member.userId),
      ...segments.map((segment) => segment.userId),
      ...overrides.map((item) => item.userId),
      ...swaps.flatMap((item) => [item.requesterId, item.colleagueId]),
      schedule.ownerUserId,
    ]);
    const person = (userId: string | null) =>
      userId === null
        ? null
        : { userId, displayName: names.get(userId)?.displayName ?? '', isAvailable: names.get(userId)?.isAvailable ?? false };
    return {
      group,
      schedule: {
        id: schedule.id,
        timezone: schedule.timezone,
        handoffTime: formatHandoffTime(schedule.handoffMinute),
        rotationLength: schedule.rotationLength,
        rotationStartDate: schedule.rotationStartDate,
        isActive: schedule.isActive,
        autoAssignOutsideHours: schedule.autoAssignOutsideHours,
        owner: person(schedule.ownerUserId),
        members: schedule.members.map((member) => ({ position: member.position, ...person(member.userId)! })),
      },
      segments: segments.map((segment) => this.toSegmentResponse(segment, person)),
      current: current === null ? null : this.toSegmentResponse(current, person),
      overrides: overrides.map((item) => ({
        id: item.id,
        person: person(item.userId),
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        reason: item.reason,
        fromSwap: item.swapRequestId !== null,
      })),
      swaps: swaps.map((item) => ({
        id: item.id,
        requester: person(item.requesterId),
        colleague: person(item.colleagueId),
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt.toISOString(),
        reason: item.reason,
      })),
      candidates,
      defaultTimezone: schedule.timezone,
      canManage: viewer.canManage,
    };
  }

  /** Header indicator and "my shifts": current and next shift of the viewer (14 days ahead). */
  async me(viewer: OnCallViewer) {
    if (!(await this.isEnabled())) return { enabled: false, current: [], next: null };
    const now = new Date();
    const ahead = new Date(now.getTime() + 14 * dayMs);
    const contexts = await loadActiveOnCallContexts(this.prisma, { from: now, to: ahead }, { userIds: [viewer.userId] });
    const groups = await this.prisma.group.findMany({
      where: { id: { in: contexts.map((context) => context.groupId) } },
      select: { id: true, name: true },
    });
    const groupName = new Map(groups.map((group) => [group.id, group.name]));
    const current: { groupId: string; groupName: string; endsAt: string }[] = [];
    let next: { groupId: string; groupName: string; startsAt: string; endsAt: string } | null = null;
    for (const context of contexts) {
      for (const segment of listContextSegments(context, now, ahead)) {
        if (segment.userId !== viewer.userId) continue;
        if (segment.startsAt.getTime() <= now.getTime()) {
          current.push({
            groupId: context.groupId,
            groupName: groupName.get(context.groupId) ?? '',
            endsAt: segment.endsAt.toISOString(),
          });
        } else if (next === null || segment.startsAt.getTime() < new Date(next.startsAt).getTime()) {
          next = {
            groupId: context.groupId,
            groupName: groupName.get(context.groupId) ?? '',
            startsAt: segment.startsAt.toISOString(),
            endsAt: segment.endsAt.toISOString(),
          };
        }
      }
    }
    return { enabled: true, current, next };
  }

  async mySwaps(viewer: OnCallViewer) {
    await this.requireEnabled();
    const rows = await this.prisma.onCallSwapRequest.findMany({
      where: {
        OR: [{ requesterId: viewer.userId }, { colleagueId: viewer.userId }],
        endsAt: { gt: new Date(Date.now() - 30 * dayMs) },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        requesterId: true,
        colleagueId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
        decidedAt: true,
        createdAt: true,
        schedule: { select: { group: { select: { id: true, name: true } } } },
      },
    });
    const names = await this.loadNames(rows.flatMap((row) => [row.requesterId, row.colleagueId]));
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      direction: row.colleagueId === viewer.userId ? 'incoming' : 'outgoing',
      groupId: row.schedule.group.id,
      groupName: row.schedule.group.name,
      requester: { userId: row.requesterId, displayName: names.get(row.requesterId)?.displayName ?? '' },
      colleague: { userId: row.colleagueId, displayName: names.get(row.colleagueId)?.displayName ?? '' },
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      reason: row.reason,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  // --------------------------------------------------------------- writes

  async save(groupId: string, input: SaveOnCallScheduleInput, viewer: OnCallViewer) {
    await this.requireEnabled();
    this.requireManager(viewer);
    const group = await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true, name: true } });
    if (group === null) throw new OnCallError(onCallErrorCodes.groupNotFound);
    const reason = requireReason(input.reason);
    const timezone = assertTimeZone(input.timezone);
    const handoffMinute = parseHandoffTime(input.handoffTime);
    if (input.rotationLength !== 'DAY' && input.rotationLength !== 'WEEK') {
      throw new OnCallError(onCallErrorCodes.invalidSchedule, 'rotationLength');
    }
    if (parseCivilDate(input.rotationStartDate) === null) {
      throw new OnCallError(onCallErrorCodes.invalidSchedule, 'rotationStartDate');
    }
    const memberUserIds = [...input.memberUserIds];
    if (new Set(memberUserIds).size !== memberUserIds.length || memberUserIds.length > onCallLimits.maxMembers) {
      throw new OnCallError(onCallErrorCodes.invalidMember, 'members');
    }
    const eligible = new Set((await this.listEligibleMembers(groupId)).map((candidate) => candidate.userId));
    const previous = await this.prisma.onCallSchedule.findUnique({
      where: { groupId },
      select: { members: { select: { userId: true } } },
    });
    const previousMembers = new Set(previous?.members.map((member) => member.userId) ?? []);
    for (const userId of memberUserIds) {
      // A member who has since left the group may stay (their shifts show as uncovered) but not be added.
      if (!eligible.has(userId) && !previousMembers.has(userId)) {
        throw new OnCallError(onCallErrorCodes.invalidMember, userId);
      }
    }
    if (input.ownerUserId !== null) {
      const owner = await this.prisma.user.findFirst({
        where: {
          id: input.ownerUserId,
          isActive: true,
          anonymizedAt: null,
          userRoles: { some: { role: { key: { in: staffRoleKeys } } } },
        },
        select: { id: true },
      });
      if (owner === null) throw new OnCallError(onCallErrorCodes.invalidMember, 'owner');
    }
    const data = {
      timezone,
      handoffMinute,
      rotationLength: input.rotationLength,
      rotationStartDate: input.rotationStartDate,
      isActive: input.isActive,
      autoAssignOutsideHours: input.autoAssignOutsideHours,
      // Uncovered shifts must reach someone (§4.2): no owner → whoever saves it.
      ownerUserId: input.ownerUserId ?? viewer.userId,
    };
    const saved = await this.prisma.$transaction(async (transaction) => {
      const schedule = await transaction.onCallSchedule.upsert({
        where: { groupId },
        create: { groupId, ...data },
        update: data,
        select: { id: true },
      });
      await transaction.onCallRotationMember.deleteMany({ where: { scheduleId: schedule.id } });
      if (memberUserIds.length > 0) {
        await transaction.onCallRotationMember.createMany({
          data: memberUserIds.map((userId, position) => ({ scheduleId: schedule.id, userId, position })),
        });
      }
      await this.audit(transaction, auditLogActions.onCallScheduleSaved, schedule.id, viewer.userId, {
        groupId,
        reason,
        ...data,
        memberUserIds,
        created: previous === null,
      });
      return schedule;
    });
    return { id: saved.id };
  }

  async remove(groupId: string, reasonInput: string, viewer: OnCallViewer): Promise<void> {
    await this.requireEnabled();
    this.requireManager(viewer);
    const reason = requireReason(reasonInput);
    const schedule = await this.prisma.onCallSchedule.findUnique({ where: { groupId }, select: { id: true } });
    if (schedule === null) throw new OnCallError(onCallErrorCodes.scheduleNotFound);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.onCallSchedule.delete({ where: { id: schedule.id } });
      await this.audit(transaction, auditLogActions.onCallScheduleDeleted, schedule.id, viewer.userId, { groupId, reason });
    });
  }

  async createOverride(
    groupId: string,
    input: OnCallRangeInput & { readonly userId: string },
    viewer: OnCallViewer,
  ) {
    await this.requireEnabled();
    this.requireManager(viewer);
    const schedule = await this.requireSchedule(groupId);
    const reason = requireReason(input.reason);
    const range = this.validateRange(input.startsAt, input.endsAt);
    const eligible = new Set((await this.listEligibleMembers(groupId)).map((candidate) => candidate.userId));
    if (!eligible.has(input.userId)) throw new OnCallError(onCallErrorCodes.invalidMember, input.userId);
    const created = await this.insertOverride(schedule.id, {
      userId: input.userId,
      ...range,
      reason,
      createdById: viewer.userId,
      swapRequestId: null,
    });
    return { id: created };
  }

  async deleteOverride(overrideId: string, reasonInput: string, viewer: OnCallViewer): Promise<void> {
    await this.requireEnabled();
    this.requireManager(viewer);
    const reason = requireReason(reasonInput);
    const override = await this.prisma.onCallOverride.findUnique({
      where: { id: overrideId },
      select: { id: true, scheduleId: true, userId: true, startsAt: true, endsAt: true },
    });
    if (override === null) throw new OnCallError(onCallErrorCodes.overrideNotFound);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.onCallOverride.delete({ where: { id: override.id } });
      await this.audit(transaction, auditLogActions.onCallOverrideDeleted, override.scheduleId, viewer.userId, {
        overrideId: override.id,
        userId: override.userId,
        startsAt: override.startsAt.toISOString(),
        endsAt: override.endsAt.toISOString(),
        reason,
      });
    });
  }

  async requestSwap(
    groupId: string,
    input: OnCallRangeInput & { readonly colleagueId: string },
    viewer: OnCallViewer,
  ) {
    await this.requireEnabled();
    const schedule = await this.prisma.onCallSchedule.findUnique({
      where: { groupId },
      select: {
        id: true,
        timezone: true,
        group: { select: { name: true } },
        members: { select: { userId: true, user: { select: { isActive: true, anonymizedAt: true } } } },
      },
    });
    if (schedule === null) throw new OnCallError(onCallErrorCodes.scheduleNotFound);
    const reason = requireReason(input.reason);
    const range = this.validateRange(input.startsAt, input.endsAt);
    const members = new Map(schedule.members.map((member) => [member.userId, member.user]));
    const colleague = members.get(input.colleagueId);
    if (
      !members.has(viewer.userId) ||
      input.colleagueId === viewer.userId ||
      colleague === undefined ||
      !colleague.isActive ||
      colleague.anonymizedAt !== null
    ) {
      throw new OnCallError(onCallErrorCodes.swapNotAllowed);
    }
    const created = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.onCallSwapRequest.create({
        data: {
          scheduleId: schedule.id,
          requesterId: viewer.userId,
          colleagueId: input.colleagueId,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          reason,
        },
        select: { id: true },
      });
      await this.audit(transaction, auditLogActions.onCallSwapRequested, schedule.id, viewer.userId, {
        swapRequestId: row.id,
        colleagueId: input.colleagueId,
        startsAt: range.startsAt.toISOString(),
        endsAt: range.endsAt.toISOString(),
      });
      return row;
    });
    const requesterName = (await this.loadNames([viewer.userId])).get(viewer.userId)?.displayName ?? '';
    await this.notify(input.colleagueId, notificationTypes.onCallSwap, `swap:${created.id}:requested`, (locale) =>
      onCallText(locale, 'swapRequested', {
        group: schedule.group.name,
        name: requesterName,
        from: formatOnCallTime(range.startsAt, schedule.timezone, locale),
        to: formatOnCallTime(range.endsAt, schedule.timezone, locale),
      }),
    );
    return { id: created.id };
  }

  async decideSwap(swapId: string, decision: 'accept' | 'decline', viewer: OnCallViewer): Promise<void> {
    await this.requireEnabled();
    const swap = await this.prisma.onCallSwapRequest.findUnique({
      where: { id: swapId },
      select: {
        id: true,
        scheduleId: true,
        requesterId: true,
        colleagueId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
        status: true,
        schedule: { select: { timezone: true, group: { select: { name: true } } } },
      },
    });
    if (swap === null) throw new OnCallError(onCallErrorCodes.swapNotFound);
    if (swap.colleagueId !== viewer.userId) throw new OnCallError(onCallErrorCodes.swapNotAllowed);
    if (swap.status !== 'PENDING') throw new OnCallError(onCallErrorCodes.swapNotPending);
    const now = new Date();
    if (decision === 'accept') {
      if (swap.endsAt.getTime() <= now.getTime()) throw new OnCallError(onCallErrorCodes.invalidRange, 'past');
      await this.insertOverride(
        swap.scheduleId,
        {
          userId: swap.colleagueId,
          startsAt: swap.startsAt,
          endsAt: swap.endsAt,
          reason: swap.reason,
          createdById: viewer.userId,
          swapRequestId: swap.id,
        },
        async (transaction) => {
          const updated = await transaction.onCallSwapRequest.updateMany({
            where: { id: swap.id, status: 'PENDING' },
            data: { status: 'ACCEPTED', decidedAt: now },
          });
          if (updated.count !== 1) throw new OnCallError(onCallErrorCodes.swapNotPending);
          await this.audit(transaction, auditLogActions.onCallSwapAccepted, swap.scheduleId, viewer.userId, {
            swapRequestId: swap.id,
          });
        },
      );
    } else {
      await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.onCallSwapRequest.updateMany({
          where: { id: swap.id, status: 'PENDING' },
          data: { status: 'DECLINED', decidedAt: now },
        });
        if (updated.count !== 1) throw new OnCallError(onCallErrorCodes.swapNotPending);
        await this.audit(transaction, auditLogActions.onCallSwapDeclined, swap.scheduleId, viewer.userId, {
          swapRequestId: swap.id,
        });
      });
    }
    const colleagueName = (await this.loadNames([viewer.userId])).get(viewer.userId)?.displayName ?? '';
    await this.notify(swap.requesterId, notificationTypes.onCallSwap, `swap:${swap.id}:${decision}`, (locale) =>
      onCallText(locale, decision === 'accept' ? 'swapAccepted' : 'swapDeclined', {
        group: swap.schedule.group.name,
        name: colleagueName,
        from: formatOnCallTime(swap.startsAt, swap.schedule.timezone, locale),
        to: formatOnCallTime(swap.endsAt, swap.schedule.timezone, locale),
      }),
    );
  }

  async cancelSwap(swapId: string, viewer: OnCallViewer): Promise<void> {
    await this.requireEnabled();
    const swap = await this.prisma.onCallSwapRequest.findUnique({
      where: { id: swapId },
      select: { id: true, scheduleId: true, requesterId: true, status: true },
    });
    if (swap === null) throw new OnCallError(onCallErrorCodes.swapNotFound);
    if (swap.requesterId !== viewer.userId && !viewer.canManage) throw new OnCallError(onCallErrorCodes.swapNotAllowed);
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.onCallSwapRequest.updateMany({
        where: { id: swap.id, status: 'PENDING' },
        data: { status: 'CANCELLED', decidedAt: new Date() },
      });
      if (updated.count !== 1) throw new OnCallError(onCallErrorCodes.swapNotPending);
      await this.audit(transaction, auditLogActions.onCallSwapCancelled, swap.scheduleId, viewer.userId, {
        swapRequestId: swap.id,
      });
    });
  }

  // ----------------------------------------------------------------- iCal

  async calendarTokenStatus(viewer: OnCallViewer) {
    const row = await this.prisma.onCallCalendarToken.findUnique({
      where: { userId: viewer.userId },
      select: { createdAt: true },
    });
    return { exists: row !== null, createdAt: row?.createdAt.toISOString() ?? null };
  }

  /** Returns the token once; only its hash is stored. Rotating invalidates the previous URL. */
  async rotateCalendarToken(viewer: OnCallViewer): Promise<{ token: string }> {
    await this.requireEnabled();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashCalendarToken(token);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.onCallCalendarToken.upsert({
        where: { userId: viewer.userId },
        create: { userId: viewer.userId, tokenHash },
        update: { tokenHash, createdAt: new Date() },
      });
      await appendAuditLog(transaction as unknown as AuditLogWriteClient, {
        action: auditLogActions.onCallCalendarTokenRotated,
        entityType: auditLogEntityTypes.user,
        entityId: viewer.userId,
        metadata: {},
        actorUserId: viewer.userId,
      });
    });
    return { token };
  }

  async revokeCalendarToken(viewer: OnCallViewer): Promise<void> {
    const deleted = await this.prisma.onCallCalendarToken.deleteMany({ where: { userId: viewer.userId } });
    if (deleted.count > 0) {
      await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.onCallCalendarTokenRevoked,
        entityType: auditLogEntityTypes.user,
        entityId: viewer.userId,
        metadata: {},
        actorUserId: viewer.userId,
      });
    }
  }

  /** Public feed (token in the URL). Null → 404, without saying why. */
  async icalFeed(token: string): Promise<string | null> {
    if (!(await this.isEnabled()) || token.length < 20 || token.length > 100) return null;
    const row = await this.prisma.onCallCalendarToken.findUnique({
      where: { tokenHash: hashCalendarToken(token) },
      select: {
        userId: true,
        user: {
          select: {
            isActive: true,
            anonymizedAt: true,
            preferredLocale: true,
            userRoles: { where: { role: { key: { in: staffRoleKeys } } }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    if (row === null || !row.user.isActive || row.user.anonymizedAt !== null || row.user.userRoles.length === 0) {
      return null;
    }
    const locale = toOnCallLocale(row.user.preferredLocale, await this.defaultLocale());
    const now = new Date();
    const from = new Date(now.getTime() - onCallLimits.icalBehindDays * dayMs);
    const to = new Date(now.getTime() + onCallLimits.icalAheadDays * dayMs);
    const contexts = await loadActiveOnCallContexts(this.prisma, { from, to }, { userIds: [row.userId] });
    const groups = await this.prisma.group.findMany({
      where: { id: { in: contexts.map((context) => context.groupId) } },
      select: { id: true, name: true },
    });
    const groupName = new Map(groups.map((group) => [group.id, group.name]));
    const events = contexts.flatMap((context) =>
      listContextSegments(context, from, to)
        .filter((segment) => segment.userId === row.userId)
        .map((segment) => {
          const group = groupName.get(context.groupId) ?? '';
          return {
            uid: `${context.id}-${segment.startsAt.getTime()}-${segment.overrideId ?? 'r'}@help-desk-enterprise`,
            startsAt: segment.startsAt,
            endsAt: segment.endsAt,
            summary: onCallText(locale, 'icalSummary', { group }),
            description: onCallText(locale, 'icalDescription', { group }),
          };
        }),
    );
    return buildOnCallIcal({
      calendarName: onCallText(locale, 'icalCalendar', { group: '' }),
      events,
      generatedAt: now,
    });
  }

  // -------------------------------------------------------------- helpers

  private requireManager(viewer: OnCallViewer): void {
    if (!viewer.canManage) throw new OnCallError(onCallErrorCodes.forbidden);
  }

  private async requireSchedule(groupId: string): Promise<{ id: string }> {
    const schedule = await this.prisma.onCallSchedule.findUnique({ where: { groupId }, select: { id: true } });
    if (schedule === null) throw new OnCallError(onCallErrorCodes.scheduleNotFound);
    return schedule;
  }

  private validateRange(startsAtInput: string, endsAtInput: string): { startsAt: Date; endsAt: Date } {
    const startsAt = parseInstant(startsAtInput, 'startsAt');
    const endsAt = parseInstant(endsAtInput, 'endsAt');
    const now = Date.now();
    if (endsAt.getTime() <= startsAt.getTime()) throw new OnCallError(onCallErrorCodes.invalidRange, 'order');
    if (endsAt.getTime() <= now) throw new OnCallError(onCallErrorCodes.invalidRange, 'past');
    if (endsAt.getTime() - startsAt.getTime() > onCallLimits.maxOverrideDays * dayMs) {
      throw new OnCallError(onCallErrorCodes.invalidRange, 'length');
    }
    if (endsAt.getTime() > now + onCallLimits.maxAheadDays * dayMs) {
      throw new OnCallError(onCallErrorCodes.invalidRange, 'ahead');
    }
    return { startsAt, endsAt };
  }

  /**
   * Overlap check and insert under SERIALIZABLE isolation, so two concurrent
   * overrides for the same period cannot both commit.
   */
  private async insertOverride(
    scheduleId: string,
    input: {
      readonly userId: string;
      readonly startsAt: Date;
      readonly endsAt: Date;
      readonly reason: string;
      readonly createdById: string;
      readonly swapRequestId: string | null;
    },
    extra?: (transaction: PrismaService) => Promise<void>,
  ): Promise<string> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.onCallOverride.findMany({
            where: { scheduleId, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
            select: { startsAt: true, endsAt: true },
          });
          if (overridesOverlap(input, existing)) throw new OnCallError(onCallErrorCodes.overlap);
          const created = await transaction.onCallOverride.create({
            data: { scheduleId, ...input },
            select: { id: true },
          });
          await this.audit(transaction, auditLogActions.onCallOverrideCreated, scheduleId, input.createdById, {
            overrideId: created.id,
            userId: input.userId,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
            reason: input.reason,
            swapRequestId: input.swapRequestId,
          });
          if (extra !== undefined) await extra(transaction as unknown as PrismaService);
          return created.id;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034') {
        throw new OnCallError(onCallErrorCodes.overlap);
      }
      throw error;
    }
  }

  /** Active group members holding a staff role. */
  async listEligibleMembers(groupId: string): Promise<{ userId: string; displayName: string }[]> {
    const rows = await this.prisma.groupMember.findMany({
      where: {
        groupId,
        user: {
          isActive: true,
          anonymizedAt: null,
          userRoles: { some: { role: { key: { in: staffRoleKeys } } } },
        },
      },
      select: { user: { select: { id: true, displayName: true } } },
      orderBy: { user: { displayName: 'asc' } },
    });
    return rows.map((row) => ({ userId: row.user.id, displayName: row.user.displayName }));
  }

  private async loadNames(userIds: readonly (string | null)[]): Promise<Map<string, UserName>> {
    const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, isActive: true, anonymizedAt: true },
    });
    return new Map(
      rows.map((row) => [row.id, { id: row.id, displayName: row.displayName, isAvailable: row.isActive && row.anonymizedAt === null }]),
    );
  }

  private toSegmentResponse(
    segment: OnCallSegment,
    person: (userId: string | null) => { userId: string; displayName: string; isAvailable: boolean } | null,
  ) {
    return {
      startsAt: segment.startsAt.toISOString(),
      endsAt: segment.endsAt.toISOString(),
      source: segment.source,
      person: person(segment.userId),
    };
  }

  private async audit(
    client: unknown,
    action: string,
    scheduleId: string,
    actorUserId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await appendAuditLog(client as AuditLogWriteClient, {
      action,
      entityType: auditLogEntityTypes.onCallSchedule,
      entityId: scheduleId,
      metadata: metadata as JsonValue,
      actorUserId,
    });
  }

  async defaultLocale(): Promise<string | null> {
    try {
      const value = await this.settings.getSetting(settingKeys.privateI18nDefaultLocale);
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }

  /** In-app notification in the recipient's language; never fails the caller. */
  async notify(
    userId: string,
    type: NotificationType,
    dedupeKey: string,
    body: (locale: OnCallLocale) => string,
  ): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { preferredLocale: true, isActive: true, anonymizedAt: true },
      });
      if (user === null || !user.isActive || user.anonymizedAt !== null) return false;
      const locale = toOnCallLocale(user.preferredLocale, await this.defaultLocale());
      const created = await persistInAppNotification(this.prisma, {
        userId,
        type,
        title: notificationTitleKeys[type],
        body: body(locale),
        ticketId: null,
        payload: {
          ticketId: '',
          ticketNumber: '',
          event: type,
          messageId: dedupeKey,
          actorUserId: null,
          confidential: false,
        } as never,
        dedupeKey: `oncall:${dedupeKey}`,
      });
      return created !== null;
    } catch (error) {
      this.logger.warn(`on-call notification failed (${type}): ${error instanceof Error ? error.name : 'unknown'}`);
      return false;
    }
  }
}
