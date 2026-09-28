import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { permissionKeys } from '../../authorization/authorization.constants';
import { resolveEmailLocale } from '../../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../../notifications/email/deliver-notification-email';
import type { EmailLocale } from '../../notifications/email/email-template.constants';
import {
  loadEmailChannelConfiguration,
  type EmailChannelConfiguration,
} from '../../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../../notifications/email/mail-transport';
import { localParts } from '../../notifications/preferences/notification-schedule-time';
import { weeklyReportSlot } from '../../notifications/preferences/weekly-ticket-report';
import { SettingsService } from '../../settings/settings.service';
import { retentionCategories, type RetentionCategory } from '../privacy.constants';
import { composePrivacyEmail, erasureTable, privacyEmailLabels, type PrivacyEmailKey } from './compose-privacy-email';

type Recipient = { readonly id: string; readonly email: string; readonly displayName: string; readonly preferredLocale: string | null };

const recipientSelect = { id: true, email: true, displayName: true, preferredLocale: true } as const;
/** Monday 07:00 in the installation zone, like the other weekly e-mails. */
const weeklySlot = { isoDay: 1, minute: 7 * 60 } as const;

/**
 * Paket 2.6 (§7.3, §6.1, §6.2): e-mails of the privacy module, sent by the
 * worker. Each message has a delivery dedupe key, so a job that runs every
 * 15 minutes (or is retried) sends it once. Nothing is sent while the e-mail
 * channel is disabled; the in-app views stay the source of truth.
 */
@Injectable()
export class PrivacyMailer {
  private readonly logger = new Logger(PrivacyMailer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  /** Weekly summary for `privacy.manage` holders — only if the policy deleted something. */
  async sendRetentionWeekly(timeZone: string, now: Date = new Date()): Promise<number> {
    const slot = weeklyReportSlot(now, timeZone, weeklySlot.isoDay, weeklySlot.minute);
    // Only on the day of the slot: a worker that was down for a week does not send stale news.
    if (now.getTime() - slot.getTime() > 86_400_000) return 0;
    const from = new Date(slot.getTime() - 7 * 86_400_000);
    const runs = await this.prisma.retentionRun.findMany({
      where: { mode: 'EXECUTE', startedAt: { gte: from, lt: slot }, itemCount: { gt: 0 } },
      select: { category: true, itemCount: true, status: true },
    });
    if (runs.length === 0) return 0;
    const channel = await this.channel();
    if (channel === null) return 0;
    const perCategory = new Map<RetentionCategory, { items: number; runs: number }>();
    for (const run of runs) {
      const category = run.category as RetentionCategory;
      const entry = perCategory.get(category) ?? { items: 0, runs: 0 };
      entry.items += run.itemCount;
      entry.runs += 1;
      perCategory.set(category, entry);
    }
    const partial = runs.some((run) => run.status === 'PARTIAL');
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.privacyManage } } } } } },
      },
      select: recipientSelect,
      take: 50,
    });
    let sent = 0;
    for (const user of recipients) {
      const locale = this.locale(user, channel);
      const labels = privacyEmailLabels[locale];
      const format = new Intl.NumberFormat(locale === 'bs' ? 'bs-BA' : 'en-GB');
      const ok = await this.deliver(channel, user, 'privacy.retention_weekly', `privacy-retention-weekly:${slot.toISOString()}`, {
        variables: { reportPeriod: periodLabel(from, slot, timeZone, locale) },
        tables: [
          {
            title: labels.retentionTitle,
            columns: labels.retentionColumns,
            rows: retentionCategories
              .filter((category) => perCategory.has(category))
              .map((category) => {
                const entry = perCategory.get(category)!;
                return { cells: [labels.categories[category], format.format(entry.items), format.format(entry.runs)] };
              }),
          },
        ],
        notes: partial ? [labels.partial] : [],
        footerReason: labels.retentionFooter,
        ctaPath: '/privacy?tab=retention',
      });
      if (ok) sent += 1;
    }
    return sent;
  }

  /** To the requester and the approver of a completed anonymization. */
  async sendErasureCompleted(erasureId: string): Promise<number> {
    const erasure = await this.prisma.privacyErasure.findUnique({
      where: { id: erasureId },
      select: { status: true, pseudonym: true, report: true, requestedByUserId: true, approvedByUserId: true },
    });
    if (erasure === null || erasure.status !== 'COMPLETED') return 0;
    const ids = [erasure.requestedByUserId, erasure.approvedByUserId].filter((id): id is string => id !== null);
    if (ids.length === 0) return 0;
    const channel = await this.channel();
    if (channel === null) return 0;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] }, isActive: true, anonymizedAt: null },
      select: recipientSelect,
    });
    const report = (erasure.report ?? {}) as Record<string, unknown>;
    let sent = 0;
    for (const user of users) {
      const locale = this.locale(user, channel);
      const ok = await this.deliver(channel, user, 'privacy.erasure_completed', `privacy-erasure-completed:${erasureId}`, {
        variables: { reportName: localizedPseudonym(erasure.pseudonym, locale) },
        tables: [erasureTable(locale, report)],
        notes: [],
        footerReason: privacyEmailLabels[locale].erasureFooter,
        ctaPath: '/privacy?tab=anonymization',
      });
      if (ok) sent += 1;
    }
    return sent;
  }

  /** To the owner of each scheduled report paused because it lost its last recipient. */
  async sendSchedulesPaused(scheduleIds: readonly string[]): Promise<number> {
    if (scheduleIds.length === 0) return 0;
    const channel = await this.channel();
    if (channel === null) return 0;
    const schedules = await this.prisma.reportSchedule.findMany({
      where: { id: { in: [...scheduleIds] }, enabled: false },
      select: { id: true, name: true, updatedAt: true, createdBy: { select: { ...recipientSelect, isActive: true, anonymizedAt: true } } },
    });
    let sent = 0;
    for (const schedule of schedules) {
      const owner = schedule.createdBy;
      if (owner === null || !owner.isActive || owner.anonymizedAt !== null) continue;
      const locale = this.locale(owner, channel);
      const ok = await this.deliver(
        channel,
        owner,
        'report.schedule_paused',
        `report-schedule-paused:${schedule.id}:${schedule.updatedAt.toISOString()}`,
        {
          variables: { reportName: schedule.name },
          tables: [],
          notes: [],
          footerReason: privacyEmailLabels[locale].scheduleFooter,
          ctaPath: '/reports?tab=schedules',
        },
      );
      if (ok) sent += 1;
    }
    return sent;
  }

  private async channel(): Promise<EmailChannelConfiguration | null> {
    const channel = await loadEmailChannelConfiguration(this.settingsService).catch(() => null);
    return channel !== null && channel.deliveryEnabled && channel.smtp !== null ? channel : null;
  }

  private locale(user: Recipient, channel: EmailChannelConfiguration): EmailLocale {
    return resolveEmailLocale(user.preferredLocale, channel);
  }

  private async deliver(
    channel: EmailChannelConfiguration,
    user: Recipient,
    key: PrivacyEmailKey,
    dedupeKey: string,
    content: Pick<Parameters<typeof composePrivacyEmail>[0], 'variables' | 'tables' | 'notes' | 'footerReason' | 'ctaPath'>,
  ): Promise<boolean> {
    const locale = this.locale(user, channel);
    const composed = composePrivacyEmail({
      configuration: channel,
      key,
      locale,
      recipientId: user.id,
      recipientName: user.displayName,
      dedupeKey,
      ...content,
    });
    try {
      await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
        userId: user.id,
        toAddress: user.email,
        dedupeKey,
        templateKey: key,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
      });
      return true;
    } catch (error) {
      this.logger.warn(`privacy_email_failed key=${key} user=${user.id} reason=${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

/** The stored pseudonym is Bosnian; English recipients read "Former user #TAG". */
export function localizedPseudonym(pseudonym: string, locale: EmailLocale): string {
  const tag = /#([0-9A-F]{4,6})$/.exec(pseudonym)?.[1];
  if (tag === undefined) return pseudonym;
  return locale === 'en' ? `Former user #${tag}` : `Bivši korisnik #${tag}`;
}

/** "21.–27. 9. 2026." / "21 Sep – 27 Sep 2026" for [from, slot). */
export function periodLabel(from: Date, slot: Date, timeZone: string, locale: EmailLocale): string {
  const first = localParts(from, timeZone);
  const last = localParts(new Date(slot.getTime() - 1), timeZone);
  if (locale === 'bs') return `${first.day}. ${first.month}. – ${last.day}. ${last.month}. ${last.year}.`;
  const month = (m: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${first.day} ${month(first.month)} – ${last.day} ${month(last.month)} ${last.year}`;
}
