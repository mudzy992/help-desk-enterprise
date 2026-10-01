import { permissionKeys } from '../authorization/authorization.constants';
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
import { composeProblemEmail, problemStatusLabel, type ProblemEmailKey } from './compose-problem-email';
import { ProblemAccessService } from './problem-access.service';
import { formatProblemNumber } from './problem-rules';
import { problemOpenTicketStatuses } from './problems.constants';

/** At most this many agents get one linked-ticket notice (more = misconfigured grouping). */
export const problemNoticeMaxRecipients = 100;

type Facts = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly ownerUserId: string | null;
  readonly groupId: string | null;
  readonly ownerName: string | null;
  readonly targetAt: Date | null;
};

type Notice = {
  readonly type: NotificationType;
  /** E-mail template, or null for in-app only. */
  readonly emailKey: ProblemEmailKey | null;
  readonly recipientIds: readonly string[];
  /** Distinguishes repeated events of the same kind (dedupe). */
  readonly occurrence: string;
  /** Extra text after the problem in the in-app body (e.g. the ticket number). */
  readonly suffix?: string;
  /** `{{reportPeriod}}` per locale. */
  readonly detail: (locale: 'bs' | 'en', format: (date: Date) => string) => string;
};

function formatDate(value: Date, locale: 'bs' | 'en', timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'bs' ? 'bs-BA' : 'en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/**
 * Paket 3.3 (P5, §11): problem notices. In-app always (subject to the user's
 * preferences), e-mail for assignment, resolution and the target. Never the
 * actor; only active users. Failures are logged and never break the action
 * that triggered the notice.
 */
@Injectable()
export class ProblemNotifier {
  private readonly logger = new Logger(ProblemNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly access: ProblemAccessService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  /** Runs a notice without ever throwing (API callers fire and forget). */
  run(label: string, operation: () => Promise<unknown>): void {
    void operation().catch((error: unknown) => this.logger.warn(`problem_notice_failed kind=${label} reason=${errorText(error)}`));
  }

  async ownerAssigned(problemId: string, actorUserId: string | null): Promise<number> {
    const facts = await this.facts(problemId);
    if (facts === null || facts.ownerUserId === null) return 0;
    return this.send(facts, actorUserId, {
      type: notificationTypes.problemAssigned,
      emailKey: 'problem.assigned',
      recipientIds: [facts.ownerUserId],
      occurrence: `${facts.ownerUserId}:${Date.now()}`,
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

  /** Decision 2026-10-01: a new (or handed-over) problem without an owner, to the problem managers of its group. */
  async groupAssigned(problemId: string, actorUserId: string | null): Promise<number> {
    const facts = await this.facts(problemId);
    if (facts === null || facts.groupId === null) return 0;
    return this.send(facts, actorUserId, {
      type: notificationTypes.problemGroupAssigned,
      emailKey: null,
      recipientIds: await this.groupManagers(facts.groupId),
      occurrence: `${facts.groupId}:${Date.now()}`,
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

  /** §11: KNOWN_ERROR (workaround available) or RESOLVED, to agents of the still-open linked tickets. */
  async statusChanged(problemId: string, status: string, actorUserId: string | null): Promise<number> {
    if (status !== 'KNOWN_ERROR' && status !== 'RESOLVED') return 0;
    const facts = await this.facts(problemId);
    if (facts === null) return 0;
    const links = await this.prisma.problemTicket.findMany({
      where: { problemId, ticket: { status: { in: [...problemOpenTicketStatuses] }, assignedUserId: { not: null } } },
      select: { ticket: { select: { assignedUserId: true } } },
      take: 2000,
    });
    const recipientIds = [...new Set(links.map((link) => link.ticket.assignedUserId).filter((id): id is string => id !== null))];
    const resolved = status === 'RESOLVED';
    return this.send(facts, actorUserId, {
      type: resolved ? notificationTypes.problemResolved : notificationTypes.problemKnownError,
      emailKey: resolved ? 'problem.resolved' : null,
      recipientIds: recipientIds.slice(0, problemNoticeMaxRecipients),
      occurrence: `${status}:${Date.now()}`,
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

  /** §11: a new ticket joined a problem that was already resolved (the cause may be back). */
  async recurrence(problemId: string, ticketNumbers: readonly string[], actorUserId: string | null): Promise<number> {
    if (ticketNumbers.length === 0) return 0;
    const facts = await this.facts(problemId);
    if (facts === null || (facts.status !== 'RESOLVED' && facts.status !== 'CLOSED')) return 0;
    // Decision 2026-10-01: the owner and the problem managers of the group.
    const recipientIds = [...(facts.ownerUserId === null ? [] : [facts.ownerUserId]), ...(facts.groupId === null ? [] : await this.groupManagers(facts.groupId))];
    return this.send(facts, actorUserId, {
      type: notificationTypes.problemRecurrence,
      emailKey: null,
      recipientIds,
      occurrence: ticketNumbers.join(','),
      suffix: ticketNumbers.slice(0, 5).join(', '),
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

  /** §10: target reminder to the owner, or the group members without an owner. */
  async targetDue(problemId: string, stage: string): Promise<number> {
    const facts = await this.facts(problemId);
    if (facts === null || facts.targetAt === null) return 0;
    let recipientIds: string[] = facts.ownerUserId === null ? [] : [facts.ownerUserId];
    if (recipientIds.length === 0 && facts.groupId !== null) recipientIds = await this.groupManagers(facts.groupId);
    const targetAt = facts.targetAt;
    return this.send(facts, null, {
      type: notificationTypes.problemTargetDue,
      emailKey: 'problem.target_due',
      recipientIds,
      occurrence: `${stage}:${targetAt.toISOString()}`,
      detail: (_locale, format) => format(targetAt),
    });
  }

  /** Problem managers of a problem group (members holding problem.manage through a role). */
  private async groupManagers(groupId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        groupMembers: { some: { groupId } },
        userRoles: { some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.problemManage } } } } } },
      },
      select: { id: true },
      take: problemNoticeMaxRecipients,
    });
    return users.map((user) => user.id);
  }

  private async facts(problemId: string): Promise<Facts | null> {
    const row = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: {
        id: true,
        sequence: true,
        title: true,
        status: true,
        priority: true,
        ownerUserId: true,
        groupId: true,
        targetAt: true,
        owner: { select: { displayName: true } },
      },
    });
    if (row === null) return null;
    const configuration = await this.access.configuration();
    return {
      id: row.id,
      number: formatProblemNumber(configuration.numberPrefix, row.sequence),
      title: row.title,
      status: row.status,
      priority: row.priority,
      ownerUserId: row.ownerUserId,
      groupId: row.groupId,
      ownerName: row.owner?.displayName ?? null,
      targetAt: row.targetAt,
    };
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
    const dedupeKey = `problem:${notice.type}:${facts.id}:${notice.occurrence}`;
    const body = `${facts.number} · ${facts.title}${notice.suffix ? ` — ${notice.suffix}` : ''}`.slice(0, 500);
    let delivered = 0;
    for (const user of users) {
      const decision = decisions.get(user.id);
      if (decision?.inApp !== false) {
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
            problemId: facts.id,
            problemNumber: facts.number,
          } as never,
          dedupeKey: `${dedupeKey}:${user.id}`,
        }).catch((error: unknown) => {
          this.logger.warn(`problem_notice_in_app_failed user=${user.id} reason=${errorText(error)}`);
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
    const format = (date: Date) => formatDate(date, locale, timeZone);
    const composed = composeProblemEmail({
      configuration: channel,
      key: notice.emailKey,
      locale,
      recipientKey: user.id,
      recipientName: user.displayName,
      problem: {
        id: facts.id,
        number: facts.number,
        title: facts.title,
        status: facts.status,
        priority: facts.priority,
        ownerName: facts.ownerName,
        target: facts.targetAt === null ? null : format(facts.targetAt),
      },
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
      this.logger.warn(`problem_notice_email_failed user=${user.id} reason=${errorText(error)}`);
    }
  }
}
