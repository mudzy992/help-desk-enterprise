import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../notifications/email/is-allowed-notification-email-address';
import { loadEmailChannelConfiguration, type EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTitleKeys, notificationTypes, type NotificationType } from '../notifications/notifications.constants';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../notifications/preferences/resolve-delivery-decisions';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import { SettingsService } from '../settings/settings.service';
import { ChangeAccessService } from './change-access.service';
import { formatChangeNumber } from './change-rules';
import { loadCabVoterIds } from './load-cab-voters';
import { changeDecisionLabel, changeTypeLabel, composeChangeEmail, type ChangeEmailKey } from './compose-change-email';

type Facts = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly risk: string;
  readonly ownerUserId: string | null;
  readonly requesterUserId: string | null;
  readonly cabGroupId: string | null;
  readonly plannedStart: Date | null;
  readonly plannedEnd: Date | null;
};

type Notice = {
  readonly type: NotificationType;
  readonly emailKey: ChangeEmailKey | null;
  readonly recipientIds: readonly string[];
  /** Distinguishes repeated events of the same kind (dedupe). */
  readonly occurrence: string;
  readonly suffix?: (locale: 'bs' | 'en') => string;
  /** `{{reportPeriod}}` per locale. */
  readonly detail: (locale: 'bs' | 'en', format: (date: Date) => string) => string;
};

function formatInstant(value: Date, locale: 'bs' | 'en', timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'bs' ? 'bs-BA' : 'en-GB', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  } catch {
    return value.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/**
 * Paket 3.4 (§14): change notices. In-app always (subject to the user's
 * preferences), e-mail for the CAB vote, the decision and the reminders.
 * Never the actor; only active users. Failures are logged and never break the
 * action that triggered the notice.
 */
@Injectable()
export class ChangeNotifier {
  private readonly logger = new Logger(ChangeNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly access: ChangeAccessService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  /** Runs a notice without ever throwing (API callers fire and forget). */
  run(label: string, operation: () => Promise<unknown>): void {
    void operation().catch((error: unknown) => this.logger.warn(`change_notice_failed kind=${label} reason=${errorText(error)}`));
  }

  /** §8: the change entered AUTHORIZATION; every voting CAB member except the requester. */
  async approvalRequested(changeId: string, round: number, actorUserId: string | null): Promise<number> {
    const facts = await this.facts(changeId);
    if (facts === null || facts.cabGroupId === null) return 0;
    const recipientIds = (await this.cabVoters(facts.cabGroupId)).filter((id) => id !== facts.requesterUserId);
    return this.send(facts, actorUserId, {
      type: notificationTypes.changeApprovalRequested,
      emailKey: 'change.approval_requested',
      recipientIds,
      occurrence: `round:${round}`,
      detail: (locale) => changeTypeLabel(locale, facts.type),
    });
  }

  /** §8: the CAB approved (quorum) or rejected; requester and owner. */
  async decided(changeId: string, decision: 'APPROVED' | 'REJECTED', round: number, actorUserId: string | null): Promise<number> {
    const facts = await this.facts(changeId);
    if (facts === null) return 0;
    return this.send(facts, actorUserId, {
      type: notificationTypes.changeDecided,
      emailKey: 'change.decided',
      recipientIds: [facts.requesterUserId, facts.ownerUserId].filter((id): id is string => id !== null),
      occurrence: `${decision}:${round}`,
      suffix: (locale) => changeDecisionLabel(locale, decision),
      detail: (locale) => changeDecisionLabel(locale, decision),
    });
  }

  /** §14: reminder before the planned start; owner, otherwise the requester. */
  async startingSoon(changeId: string): Promise<number> {
    const facts = await this.facts(changeId);
    if (facts === null || facts.plannedStart === null) return 0;
    const start = facts.plannedStart;
    const recipient = facts.ownerUserId ?? facts.requesterUserId;
    return this.send(facts, null, {
      type: notificationTypes.changeStartingSoon,
      emailKey: 'change.starting_soon',
      recipientIds: recipient === null ? [] : [recipient],
      occurrence: start.toISOString(),
      detail: (_locale, format) => format(start),
    });
  }

  /** §14: still implementing after the planned end; owner, otherwise the CAB members. */
  async overdue(changeId: string): Promise<number> {
    const facts = await this.facts(changeId);
    if (facts === null || facts.plannedEnd === null) return 0;
    const end = facts.plannedEnd;
    const recipientIds = facts.ownerUserId !== null ? [facts.ownerUserId] : facts.cabGroupId === null ? [] : await this.cabVoters(facts.cabGroupId);
    return this.send(facts, null, {
      type: notificationTypes.changeOverdue,
      emailKey: 'change.overdue',
      recipientIds,
      occurrence: end.toISOString(),
      detail: (_locale, format) => format(end),
    });
  }

  /** §12: a failed or rolled-back change linked to a problem; the problem owner (in-app). */
  async failedOnProblem(changeId: string, problemOwnerId: string, actorUserId: string | null): Promise<number> {
    const facts = await this.facts(changeId);
    if (facts === null) return 0;
    return this.send(facts, actorUserId, {
      type: notificationTypes.changeFailed,
      emailKey: null,
      recipientIds: [problemOwnerId],
      occurrence: 'failed',
      detail: () => '',
    });
  }

  async cabVoters(groupId: string): Promise<string[]> {
    return loadCabVoterIds(this.prisma, groupId);
  }

  private async facts(changeId: string): Promise<Facts | null> {
    const row = await this.prisma.changeRequest.findUnique({
      where: { id: changeId },
      select: {
        id: true,
        sequence: true,
        title: true,
        type: true,
        status: true,
        risk: true,
        ownerUserId: true,
        requesterUserId: true,
        cabGroupId: true,
        plannedStart: true,
        plannedEnd: true,
      },
    });
    if (row === null) return null;
    const configuration = await this.access.configuration();
    return { ...row, number: formatChangeNumber(configuration.numberPrefix, row.sequence) };
  }

  private async send(facts: Facts, actorUserId: string | null, notice: Notice): Promise<number> {
    const ids = [...new Set(notice.recipientIds)].filter((id) => id !== actorUserId);
    if (ids.length === 0) return 0;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true, anonymizedAt: null },
      select: { id: true, email: true, displayName: true, preferredLocale: true },
    });
    if (users.length === 0) return 0;
    const now = new Date();
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const decisions = await resolveDeliveryDecisions(this.prisma, policy, { type: notice.type, userIds: users.map((user) => user.id), now });
    const channel = notice.emailKey === null ? null : await loadEmailChannelConfiguration(this.settings).catch(() => null);
    const timeZone = await readInstallationTimeZone(this.settings);
    const dedupeKey = `change:${notice.type}:${facts.id}:${notice.occurrence}`;
    let delivered = 0;
    for (const user of users) {
      const decision = decisions.get(user.id);
      if (decision?.inApp !== false) {
        const locale = user.preferredLocale === 'en' ? 'en' : 'bs';
        const suffix = notice.suffix?.(locale);
        const body = `${facts.number} · ${facts.title}${suffix ? ` — ${suffix}` : ''}`.slice(0, 500);
        const created = await persistInAppNotification(this.prisma, {
          userId: user.id,
          type: notice.type,
          title: notificationTitleKeys[notice.type],
          body,
          ticketId: null,
          payload: {
            ticketId: '',
            ticketNumber: '',
            event: notice.type,
            messageId: dedupeKey,
            actorUserId,
            confidential: false,
            changeId: facts.id,
            changeNumber: facts.number,
          } as never,
          dedupeKey: `${dedupeKey}:${user.id}`,
        }).catch((error: unknown) => {
          this.logger.warn(`change_notice_in_app_failed user=${user.id} reason=${errorText(error)}`);
          return null;
        });
        if (created !== null) delivered += 1;
      }
      if (notice.emailKey !== null && decision?.email !== 'OFF' && channel !== null && channel.deliveryEnabled && channel.smtp !== null) {
        await this.email(channel, notice, facts, user, dedupeKey, timeZone);
      }
    }
    return delivered;
  }

  private async email(
    channel: EmailChannelConfiguration,
    notice: Notice,
    facts: Facts,
    user: { id: string; email: string; displayName: string; preferredLocale: string | null },
    dedupeKey: string,
    timeZone: string,
  ): Promise<void> {
    if (notice.emailKey === null || channel.smtp === null) return;
    const policy = {
      internalOnly: channel.internalOnly,
      internalDomains: channel.internalDomains,
      allowedExternalDomains: channel.allowedExternalDomains,
      allowedExternalEmails: channel.allowedExternalEmails,
    };
    if (!isAllowedNotificationEmailAddress(user.email, policy)) return;
    const locale = resolveEmailLocale(user.preferredLocale, channel);
    const format = (date: Date) => formatInstant(date, locale, timeZone);
    const window =
      facts.plannedStart === null || facts.plannedEnd === null ? null : `${format(facts.plannedStart)} – ${format(facts.plannedEnd)}`;
    const composed = composeChangeEmail({
      configuration: channel,
      key: notice.emailKey,
      locale,
      recipientKey: user.id,
      recipientName: user.displayName,
      change: { id: facts.id, number: facts.number, title: facts.title, type: facts.type, status: facts.status, risk: facts.risk, window },
      detail: notice.detail(locale, format),
      dedupeKey,
    });
    try {
      await deliverNotificationEmail(this.prisma, this.mailTransport, channel, {
        userId: user.id,
        toAddress: user.email,
        dedupeKey: `${dedupeKey}:${user.id}`,
        templateKey: notice.emailKey,
        subject: composed.subject,
        text: composed.text,
        html: composed.html,
        messageId: composed.messageId,
        headers: composed.headers,
      });
    } catch (error) {
      this.logger.warn(`change_notice_email_failed user=${user.id} reason=${errorText(error)}`);
    }
  }
}
