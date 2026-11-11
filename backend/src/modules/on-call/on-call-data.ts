import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  listOnCallSegments,
  resolveOnCall,
  type OnCallMemberShape,
  type OnCallOverrideShape,
  type OnCallScheduleShape,
  type OnCallSegment,
} from './resolve-on-call';

const onCallEnabledKey = 'private.onCall.enabled';

/**
 * Whether the on-call feature is switched on. Read straight from AppSetting so
 * that pure fan-out paths (escalation, quiet hours, auto-assignment) need no
 * SettingsService. Missing row → default (off).
 */
export async function isOnCallEnabled(prisma: PrismaService): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: onCallEnabledKey }, select: { value: true } });
  return row?.value === true;
}

/** Schedule + rotation + overrides in one read, shaped for resolveOnCall. */
export type OnCallScheduleContext = {
  readonly id: string;
  readonly groupId: string;
  readonly ownerUserId: string | null;
  readonly autoAssignOutsideHours: boolean;
  readonly shape: OnCallScheduleShape;
  readonly members: readonly OnCallMemberShape[];
  readonly overrides: readonly OnCallOverrideShape[];
};

const scheduleSelect = {
  id: true,
  groupId: true,
  ownerUserId: true,
  timezone: true,
  handoffMinute: true,
  rotationLength: true,
  rotationStartDate: true,
  isActive: true,
  autoAssignOutsideHours: true,
  members: {
    select: { userId: true, position: true, user: { select: { isActive: true, anonymizedAt: true } } },
    orderBy: { position: 'asc' as const },
  },
} as const;

type ScheduleRow = {
  id: string;
  groupId: string;
  ownerUserId: string | null;
  timezone: string;
  handoffMinute: number;
  rotationLength: 'DAY' | 'WEEK';
  rotationStartDate: string;
  isActive: boolean;
  autoAssignOutsideHours: boolean;
  members: { userId: string; position: number; user: { isActive: boolean; anonymizedAt: Date | null } }[];
};

function toContext(row: ScheduleRow, overrides: readonly OnCallOverrideShape[]): OnCallScheduleContext {
  return {
    id: row.id,
    groupId: row.groupId,
    ownerUserId: row.ownerUserId,
    autoAssignOutsideHours: row.autoAssignOutsideHours,
    shape: {
      timezone: row.timezone,
      handoffMinute: row.handoffMinute,
      rotationLength: row.rotationLength,
      rotationStartDate: row.rotationStartDate,
      isActive: row.isActive,
    },
    members: row.members.map((member) => ({
      userId: member.userId,
      position: member.position,
      isAvailable: member.user.isActive && member.user.anonymizedAt === null,
    })),
    overrides,
  };
}

async function loadOverrides(
  prisma: PrismaService,
  scheduleIds: readonly string[],
  from: Date,
  to: Date,
): Promise<Map<string, OnCallOverrideShape[]>> {
  const byId = new Map<string, OnCallOverrideShape[]>();
  if (scheduleIds.length === 0) return byId;
  const rows = await prisma.onCallOverride.findMany({
    where: { scheduleId: { in: [...scheduleIds] }, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { id: true, scheduleId: true, userId: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: 'asc' },
  });
  for (const row of rows) {
    const list = byId.get(row.scheduleId) ?? [];
    list.push({ id: row.id, userId: row.userId, startsAt: row.startsAt, endsAt: row.endsAt });
    byId.set(row.scheduleId, list);
  }
  return byId;
}

export async function loadOnCallScheduleContext(
  prisma: PrismaService,
  groupId: string,
  window: { readonly from: Date; readonly to: Date },
): Promise<OnCallScheduleContext | null> {
  const row = (await prisma.onCallSchedule.findUnique({
    where: { groupId },
    select: scheduleSelect,
  })) as ScheduleRow | null;
  if (row === null) return null;
  const overrides = await loadOverrides(prisma, [row.id], window.from, window.to);
  return toContext(row, overrides.get(row.id) ?? []);
}

/** Every active schedule (optionally only those a set of users belong to). */
export async function loadActiveOnCallContexts(
  prisma: PrismaService,
  window: { readonly from: Date; readonly to: Date },
  filter?: { readonly userIds: readonly string[] },
): Promise<OnCallScheduleContext[]> {
  const rows = (await prisma.onCallSchedule.findMany({
    where: {
      isActive: true,
      ...(filter === undefined
        ? {}
        : {
            OR: [
              { members: { some: { userId: { in: [...filter.userIds] } } } },
              {
                overrides: {
                  some: { userId: { in: [...filter.userIds] }, startsAt: { lt: window.to }, endsAt: { gt: window.from } },
                },
              },
            ],
          }),
    },
    select: scheduleSelect,
  })) as ScheduleRow[];
  const overrides = await loadOverrides(
    prisma,
    rows.map((row) => row.id),
    window.from,
    window.to,
  );
  return rows.map((row) => toContext(row, overrides.get(row.id) ?? []));
}

export function resolveContextAt(context: OnCallScheduleContext, at: Date): OnCallSegment {
  return resolveOnCall(context.shape, context.members, context.overrides, at);
}

export function listContextSegments(context: OnCallScheduleContext, from: Date, to: Date): OnCallSegment[] {
  return listOnCallSegments(context.shape, context.members, context.overrides, from, to);
}

/**
 * The on-call agent of a group right now, or null (no schedule, inactive,
 * empty rotation, unavailable member). Two small indexed reads.
 */
export async function findOnCallUserId(
  prisma: PrismaService,
  groupId: string,
  at: Date = new Date(),
): Promise<string | null> {
  if (!(await isOnCallEnabled(prisma))) return null;
  const context = await loadOnCallScheduleContext(prisma, groupId, { from: at, to: new Date(at.getTime() + 1) });
  if (context === null) return null;
  return resolveContextAt(context, at).userId;
}

/** Which of `userIds` are on call at `at` (quiet-hours bypass, §4.3). */
export async function listUsersOnCallAt(
  prisma: PrismaService,
  userIds: readonly string[],
  at: Date = new Date(),
): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0 || !(await isOnCallEnabled(prisma))) return result;
  const wanted = new Set(userIds);
  const contexts = await loadActiveOnCallContexts(prisma, { from: at, to: new Date(at.getTime() + 1) }, { userIds });
  for (const context of contexts) {
    const userId = resolveContextAt(context, at).userId;
    if (userId !== null && wanted.has(userId)) result.add(userId);
  }
  return result;
}
