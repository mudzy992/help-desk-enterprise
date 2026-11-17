import { randomUUID } from 'node:crypto';
import { permissionKeys } from '../authorization/authorization.constants';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import { assetViewerFromContext, isPathInScope } from '../assets/asset-viewer';
import { resolveEmailLocale } from '../notifications/email/compose-ticket-email';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { isAllowedNotificationEmailAddress } from '../notifications/email/is-allowed-notification-email-address';
import { loadEmailChannelConfiguration, type EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../notifications/email/mail-transport';
import {
  NotificationEmailDeliveryDeadError,
  NotificationEmailOutcomeUnknownError,
  NotificationEmailRetryNotDueError,
} from '../notifications/email/notification-email-delivery-errors';
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

/**
 * W7.25 (BA-problems-07): what one notice produced per recipient, so the caller
 * can distinguish "delivered", "nobody to notify" and "failed with a reason"
 * instead of reading a bare count. `recipients` counts the users whose policy
 * allowed at least one channel (in-app or e-mail after the address filter).
 */
export type ProblemNoticeOutcome = {
  readonly delivered: number;
  readonly recipients: number;
  readonly failures: number;
  readonly errorCode: string | null;
};

export const problemNoticeNothingSent: ProblemNoticeOutcome = {
  delivered: 0,
  recipients: 0,
  failures: 0,
  errorCode: null,
};

/**
 * The row keeps one code; a harder failure wins over a softer one so a retry
 * does not hide "the e-mail is dead" behind "the in-app write was slow".
 */
const problemNoticeErrorSeverity: Record<string, number> = {
  EMAIL_DEAD: 5,
  EMAIL_UNKNOWN: 4,
  IN_APP_FAILED: 3,
  EMAIL_FAILED: 2,
  EMAIL_PENDING: 1,
  NOTHING_DELIVERED: 0,
};

function keepWorstProblemNoticeError(current: string | null, next: string): string {
  if (current === null) return next;
  return (problemNoticeErrorSeverity[next] ?? 1) > (problemNoticeErrorSeverity[current] ?? 1) ? next : current;
}

/** Per-recipient e-mail result; the in-app channel is counted in the fan-out loop. */
type ProblemEmailOutcome = 'sent' | 'skipped' | 'pending' | 'unknown' | 'dead' | 'failed';

const problemEmailFailureCodes: Record<Exclude<ProblemEmailOutcome, 'sent' | 'skipped'>, string> = {
  pending: 'EMAIL_PENDING',
  unknown: 'EMAIL_UNKNOWN',
  dead: 'EMAIL_DEAD',
  failed: 'EMAIL_FAILED',
};

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
  readonly unitPath: string;
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
      // Do not put ticket identifiers in either notification body or dedupe payload.
      occurrence: randomUUID(),
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

  /** §10: target reminder to the owner, or the group members without an owner. */
  async targetDue(problemId: string, stage: string): Promise<number> {
    return (await this.targetDueDetailed(problemId, stage)).delivered;
  }

  /**
   * W7.25: the same reminder, with the outcome the durable row records. A
   * problem without an owner, no group and no other manager ends as
   * `NO_RECIPIENT` at the caller — a policy outcome, not a lost reminder.
   */
  async targetDueDetailed(problemId: string, stage: string): Promise<ProblemNoticeOutcome> {
    const facts = await this.facts(problemId);
    // The sweep checks this before the attempt; a race here must not write the
    // marker, so it is reported as a failure the operator can see.
    if (facts === null || facts.targetAt === null) {
      return { delivered: 0, recipients: 0, failures: 1, errorCode: 'REMINDER_TARGET_MISSING' };
    }
    let recipientIds: string[] = facts.ownerUserId === null ? [] : [facts.ownerUserId];
    if (recipientIds.length === 0 && facts.groupId !== null) recipientIds = await this.groupManagers(facts.groupId);
    const targetAt = facts.targetAt;
    return this.sendDetailed(facts, null, {
      type: notificationTypes.problemTargetDue,
      emailKey: 'problem.target_due',
      recipientIds,
      occurrence: `${stage}:${targetAt.toISOString()}`,
      detail: (_locale, format) => format(targetAt),
    });
  }

  /** Problem managers of a problem group (members holding problem.manage through a role). */
  /**
   * W7.28: a transfer into another group waits for that group's decision, so its
   * managers learn about the request before anything moves.
   */
  async handoffRequested(problemId: string, handoffId: string, targetGroupId: string, actorUserId: string | null): Promise<number> {
    const facts = await this.facts(problemId);
    if (facts === null) return 0;
    return this.send(facts, actorUserId, {
      type: notificationTypes.problemHandoffRequested,
      emailKey: null,
      recipientIds: await this.groupManagers(targetGroupId),
      occurrence: handoffId,
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

  /** W7.28: the decision goes back to the manager who asked for the transfer. */
  async handoffDecided(problemId: string, handoffId: string, requesterUserId: string | null, actorUserId: string | null): Promise<number> {
    if (requesterUserId === null) return 0;
    const facts = await this.facts(problemId);
    if (facts === null) return 0;
    return this.send(facts, actorUserId, {
      type: notificationTypes.problemHandoffDecided,
      emailKey: null,
      recipientIds: [requesterUserId],
      occurrence: handoffId,
      detail: (locale) => problemStatusLabel(locale, facts.status),
    });
  }

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
        organizationalUnit: { select: { ouPath: true } },
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
      unitPath: row.organizationalUnit.ouPath,
    };
  }

  private async send(facts: Facts, actorUserId: string | null, notice: Notice): Promise<number> {
    return (await this.sendDetailed(facts, actorUserId, notice)).delivered;
  }

  /**
   * Fan-out shared by every notice. Never throws: a failure is logged and
   * reported in the outcome, so the API callers that fire and forget keep their
   * behaviour while the target-reminder row can act on the reason.
   */
  private async sendDetailed(facts: Facts, actorUserId: string | null, notice: Notice): Promise<ProblemNoticeOutcome> {
    const ids = [...new Set(notice.recipientIds)].filter((id) => id !== actorUserId);
    if (ids.length === 0) return problemNoticeNothingSent;
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true, anonymizedAt: null },
      select: { id: true, email: true, displayName: true, preferredLocale: true },
    });
    if (users.length === 0) return problemNoticeNothingSent;
    // A problem-group membership or a linked ticket is not a grant to the full record.
    // Load each recipient's current principal; failures deny delivery rather than widening it.
    const authorized = [] as typeof users;
    for (const user of users) {
      try {
        const principal = await loadPrincipalContext(this.prisma, user.id);
        if (principal === null || !principal.isActive) continue;
        const viewer = assetViewerFromContext(principal, user.id, 'problem.');
        if (!this.access.hasPermission(viewer, permissionKeys.problemRead)) continue;
        const scope = await this.access.scopeOf(viewer, permissionKeys.problemRead);
        if (isPathInScope(scope, facts.unitPath)) authorized.push(user);
      } catch (error) {
        this.logger.warn(`problem_notice_authorization_failed user=${user.id} reason=${errorText(error)}`);
      }
    }
    if (authorized.length === 0) return problemNoticeNothingSent;
    const now = new Date();
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const decisions = await resolveDeliveryDecisions(this.prisma, policy, { type: notice.type, userIds: authorized.map((user) => user.id), now });
    const channel = notice.emailKey === null ? null : await loadEmailChannelConfiguration(this.settings).catch(() => null);
    const timeZone = await readInstallationTimeZone(this.settings);
    const dedupeKey = `problem:${notice.type}:${facts.id}:${notice.occurrence}`;
    const body = `${facts.number} · ${facts.title}${notice.suffix ? ` — ${notice.suffix}` : ''}`.slice(0, 500);
    const emailPolicy = channel === null ? null : {
      internalOnly: channel.internalOnly,
      internalDomains: channel.internalDomains,
      allowedExternalDomains: channel.allowedExternalDomains,
      allowedExternalEmails: channel.allowedExternalEmails,
    };
    let recipients = 0;
    let delivered = 0;
    let failures = 0;
    let errorCode: string | null = null;
    for (const user of authorized) {
      const decision = decisions.get(user.id);
      const inApp = decision?.inApp !== false;
      const email =
        notice.emailKey !== null &&
        emailPolicy !== null &&
        channel !== null &&
        channel.deliveryEnabled &&
        channel.smtp !== null &&
        decision?.email !== 'OFF' &&
        isAllowedNotificationEmailAddress(user.email, emailPolicy);
      // Without an allowed channel the user is not a recipient at all; only this
      // narrows the count, so "nobody to notify" stays a policy outcome.
      if (!inApp && !email) continue;
      recipients += 1;
      let userDelivered = false;
      let userFailed = false;
      if (inApp) {
        try {
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
          }, policy, decision);
          // The channel is enabled here (the policy-off case never calls this),
          // so a `null` result means the dedupe key already exists: an earlier
          // attempt of this very reminder created the row, which is a delivery.
          if (created === null) this.logger.debug(`problem_notice_in_app_replay user=${user.id} key=${dedupeKey}`);
          userDelivered = true;
        } catch (error) {
          this.logger.warn(`problem_notice_in_app_failed user=${user.id} reason=${errorText(error)}`);
          userFailed = true;
          failures += 1;
          errorCode = keepWorstProblemNoticeError(errorCode, 'IN_APP_FAILED');
        }
      }
      if (email && channel !== null) {
        const outcome = await this.email(channel, notice, facts, user, dedupeKey, timeZone);
        if (outcome === 'sent') userDelivered = true;
        else if (outcome !== 'skipped' && !userFailed) {
          userFailed = true;
          failures += 1;
          errorCode = keepWorstProblemNoticeError(errorCode, problemEmailFailureCodes[outcome]);
        }
      }
      if (userDelivered) delivered += 1;
    }
    return { delivered, recipients, failures, errorCode };
  }

  private async email(
    channel: EmailChannelConfiguration,
    notice: Notice,
    facts: Facts,
    user: { id: string; email: string; displayName: string; preferredLocale: string | null },
    dedupeKey: string,
    timeZone: string,
  ): Promise<ProblemEmailOutcome> {
    if (notice.emailKey === null || channel.smtp === null) return 'skipped';
    const policy = {
      internalOnly: channel.internalOnly,
      internalDomains: channel.internalDomains,
      allowedExternalDomains: channel.allowedExternalDomains,
      allowedExternalEmails: channel.allowedExternalEmails,
    };
    if (!isAllowedNotificationEmailAddress(user.email, policy)) return 'skipped';
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
      return 'sent';
    } catch (error) {
      this.logger.warn(`problem_notice_email_failed user=${user.id} reason=${errorText(error)}`);
      // W7.25: the durable ledger already knows whether a retry may help; the
      // reminder row records that instead of a generic "failed".
      if (error instanceof NotificationEmailRetryNotDueError) return 'pending';
      if (error instanceof NotificationEmailDeliveryDeadError) return 'dead';
      if (error instanceof NotificationEmailOutcomeUnknownError) return 'unknown';
      return 'failed';
    }
  }
}
