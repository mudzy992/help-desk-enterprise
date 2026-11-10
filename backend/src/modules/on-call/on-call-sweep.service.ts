import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notificationTypes } from '../notifications/notifications.constants';
import { parseClockMinute } from '../notifications/preferences/notification-schedule-time';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { listContextSegments, loadActiveOnCallContexts } from './on-call-data';
import { OnCallService } from './on-call.service';
import { formatOnCallTime, onCallText } from './on-call-text';
import { onCallSweepWindows, planOnCallSweep } from './plan-on-call-sweep';

const terminalStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

/** Paket 2.9 (K3, §4.5, §7): the quarter-hourly on-call sweep. Returns notifications sent. */
@Injectable()
export class OnCallSweepService {
  private readonly logger = new Logger(OnCallSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly onCall: OnCallService,
  ) {}

  async processDue(now: Date = new Date()): Promise<number> {
    if (!(await this.onCall.isEnabled())) return 0;
    const reminderMinute = parseClockMinute(String((await this.readSetting(settingKeys.privateOnCallReminderTime)) ?? '15:00'), 900);
    const from = new Date(now.getTime() - onCallSweepWindows.lookBehindMs);
    const to = new Date(now.getTime() + onCallSweepWindows.lookAheadMs);
    const contexts = await loadActiveOnCallContexts(this.prisma, { from, to });
    const groups = await this.prisma.group.findMany({
      where: { id: { in: contexts.map((context) => context.groupId) } },
      select: { id: true, name: true },
    });
    const groupName = new Map(groups.map((group) => [group.id, group.name]));
    let sent = 0;
    for (const context of contexts) {
      const actions = planOnCallSweep({
        scheduleId: context.id,
        timezone: context.shape.timezone,
        ownerUserId: context.ownerUserId,
        segments: listContextSegments(context, from, to),
        now,
        reminderMinute,
      });
      const group = groupName.get(context.groupId) ?? '';
      for (const action of actions) {
        const zone = context.shape.timezone;
        let count = 0;
        if (action.kind === 'shiftStarted') count = await this.countSlaTroubles(context.groupId);
        const type =
          action.kind === 'reminder'
            ? notificationTypes.onCallReminder
            : action.kind === 'shiftStarted'
              ? notificationTypes.onCallShiftStarted
              : notificationTypes.onCallGap;
        const delivered = await this.onCall.notify(action.userId, type, action.dedupeKey, (locale) =>
          onCallText(locale, action.kind === 'reminder' ? 'reminder' : action.kind === 'shiftStarted' ? 'shiftStarted' : 'gap', {
            group,
            from: formatOnCallTime(action.segment.startsAt, zone, locale),
            to: formatOnCallTime(action.segment.endsAt, zone, locale),
            count,
          }),
        );
        if (delivered) sent += 1;
      }
    }
    await this.applyRetention(now);
    return sent;
  }

  private async countSlaTroubles(groupId: string): Promise<number> {
    return this.prisma.ticket.count({
      where: {
        assignedGroupId: groupId,
        status: { notIn: [...terminalStatuses] },
        slaState: {
          is: {
            OR: [
              { isResponseBreached: true },
              { isResolutionBreached: true },
              { isResponseAtRisk: true },
              { isResolutionAtRisk: true },
            ],
          },
        },
      },
    });
  }

  /** §7: overrides and swap requests older than the retention are deleted (0 = keep). */
  private async applyRetention(now: Date): Promise<void> {
    const days = Number(await this.readSetting(settingKeys.privateOnCallHistoryRetentionDays));
    if (!Number.isFinite(days) || days <= 0) return;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    try {
      await this.prisma.onCallOverride.deleteMany({ where: { endsAt: { lt: cutoff } } });
      await this.prisma.onCallSwapRequest.deleteMany({ where: { endsAt: { lt: cutoff } } });
    } catch (error) {
      this.logger.warn(`on-call retention failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }

  private async readSetting(key: string): Promise<unknown> {
    try {
      return await this.settings.getSetting(key);
    } catch {
      return undefined;
    }
  }
}
