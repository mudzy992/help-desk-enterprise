import { DbNull } from '@prisma/client/runtime/client';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { InboundRawStore } from '../../inbound-email/inbound-raw-store';
import type { TicketAttachmentStorage } from '../../tickets/attachments/attachments.types';
import { privacyLimits } from '../privacy.constants';
import { replacementExample, type TextScrubber } from './text-scrubber';

export type AnonymizationSubject = {
  readonly userId: string;
  readonly email: string;
  readonly replacement: string;
  readonly scrubber: TextScrubber;
  readonly deleteOwnAttachments: boolean;
};

export type AnonymizationCounts = Record<string, number>;

export type AnonymizationResult = {
  readonly counts: AnonymizationCounts;
  /** Scheduled reports left without recipients (their owners are told, §6.2). */
  readonly pausedScheduleIds: readonly string[];
};

export type AnonymizationPreview = {
  readonly ticketsInScope: number;
  readonly ticketsOnLegalHold: number;
  readonly textReplacements: number;
  readonly examples: readonly string[];
  readonly counts: AnonymizationCounts;
};

const ticketChunk = 50;
const messageChunk = 500;

/**
 * Paket 2.6 (§6.2): the inventory of personal data of one user and how each
 * location is treated. Every step is idempotent (a scrubbed text has no more
 * matches, a deleted row is gone), so a crashed run simply starts again. The
 * `User` row itself is changed last, by the service, in one transaction.
 */
export class AnonymizationExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: TicketAttachmentStorage,
    private readonly inboundRawStore: InboundRawStore,
  ) {}

  /** Tickets the person appears on (requester, participant, author, mentioned, uploader, approver, time log). */
  async ticketScope(userId: string): Promise<{ readonly scrub: string[]; readonly held: string[] }> {
    const rows = await this.prisma.$queryRaw<{ id: string; held: boolean }[]>`
      SELECT t."id", (t."legalHoldAt" IS NOT NULL) AS "held"
      FROM "Ticket" t
      WHERE t."id" IN (
        SELECT "id" FROM "Ticket" WHERE "requesterId" = ${userId}
        UNION SELECT "ticketId" FROM "TicketParticipant" WHERE "userId" = ${userId}
        UNION SELECT "ticketId" FROM "TicketMessage" WHERE "authorUserId" = ${userId}
        UNION SELECT "ticketId" FROM "TicketMessageMention" WHERE "userId" = ${userId}
        UNION SELECT "ticketId" FROM "TicketAttachment" WHERE "uploadedByUserId" = ${userId}
        UNION SELECT "ticketId" FROM "TicketApproval" WHERE "approverUserId" = ${userId}
        UNION SELECT "ticketId" FROM "TicketTimeLog" WHERE "userId" = ${userId}
      )
      ORDER BY t."id"`;
    return {
      scrub: rows.filter((row) => !row.held).map((row) => row.id),
      held: rows.filter((row) => row.held).map((row) => row.id),
    };
  }

  async preview(subject: AnonymizationSubject): Promise<AnonymizationPreview> {
    const scope = await this.ticketScope(subject.userId);
    const examples: string[] = [];
    let replacements = 0;
    const note = (text: string | null | undefined) => {
      if (!text) return;
      const result = subject.scrubber.scrub(text);
      replacements += result.count;
      if (result.count > 0 && examples.length < privacyLimits.previewExamples) {
        const example = replacementExample(result.text, subject.replacement);
        if (example !== null) examples.push(example);
      }
    };
    await this.forEachTicketChunk(scope.scrub, async (ids) => {
      const tickets = await this.prisma.ticket.findMany({
        where: { id: { in: ids } },
        select: { title: true, description: true, formData: true, resolutionNote: true },
      });
      for (const ticket of tickets) {
        note(ticket.title);
        note(ticket.description);
        note(ticket.resolutionNote);
        replacements += subject.scrubber.scrubJson(ticket.formData).count;
      }
      await this.forEachMessageChunk(ids, async (messages) => {
        for (const message of messages) note(message.body);
      });
    });
    const u = subject.userId;
    const [notificationsOwn, sessions, deliveries, roles, groups, savedViews, templates, followers, recipients, attachments, auditRows] =
      await Promise.all([
        this.prisma.notification.count({ where: { userId: u } }),
        this.prisma.userSession.count({ where: { userId: u } }),
        this.prisma.notificationEmailDelivery.count({ where: { userId: u } }),
        this.prisma.userRole.count({ where: { userId: u } }),
        this.prisma.groupMember.count({ where: { userId: u } }),
        this.prisma.savedView.count({ where: { userId: u } }),
        this.prisma.responseTemplate.count({ where: { ownerUserId: u } }),
        this.prisma.ticketParticipant.count({ where: { userId: u, role: { in: ['FOLLOWER', 'WATCHER'] } } }),
        this.prisma.reportScheduleRecipient.count({ where: { userId: u } }),
        this.prisma.ticketAttachment.count({ where: { uploadedByUserId: u } }),
        this.prisma.auditLog.count({ where: { OR: [{ actorUserId: u }, { entityId: u }] } }),
      ]);
    return {
      ticketsInScope: scope.scrub.length + scope.held.length,
      ticketsOnLegalHold: scope.held.length,
      textReplacements: replacements,
      examples,
      counts: {
        notificationsOwn,
        sessions,
        emailDeliveries: deliveries,
        roles,
        groups,
        savedViews,
        personalTemplates: templates,
        followerLinks: followers,
        reportRecipients: recipients,
        attachmentsUploaded: attachments,
        auditRowsLinked: auditRows,
      },
    };
  }

  async execute(subject: AnonymizationSubject): Promise<AnonymizationResult> {
    const counts: AnonymizationCounts = {};
    const pausedScheduleIds: string[] = [];
    const add = (key: string, value: number) => {
      if (value > 0) counts[key] = (counts[key] ?? 0) + value;
    };
    const u = subject.userId;
    const scope = await this.ticketScope(u);
    add('ticketsOnLegalHoldSkipped', scope.held.length);
    const now = new Date();
    const { scrubber } = subject;

    await this.forEachTicketChunk(scope.scrub, async (ids) => {
      const tickets = await this.prisma.ticket.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, description: true, formData: true, resolutionNote: true },
      });
      for (const ticket of tickets) {
        const title = scrubber.scrub(ticket.title);
        const description = scrubber.scrub(ticket.description);
        const note = ticket.resolutionNote === null ? null : scrubber.scrub(ticket.resolutionNote);
        const form = scrubber.scrubJson(ticket.formData);
        const changed = title.count + description.count + (note?.count ?? 0) + form.count;
        if (changed === 0) continue;
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            title: title.text,
            description: description.text,
            resolutionNote: note?.text ?? null,
            ...(form.count > 0 ? { formData: form.value as never } : {}),
          },
        });
        add('tickets', 1);
        add('textReplacements', changed);
      }
      await this.forEachMessageChunk(ids, async (messages) => {
        for (const message of messages) {
          const result = scrubber.scrub(message.body);
          if (result.count === 0) continue;
          await this.prisma.ticketMessage.update({
            where: { id: message.id },
            data: { body: result.text, redactedAt: now },
          });
          add('messages', 1);
          add('textReplacements', result.count);
        }
      });
      add('forwardReasons', await this.scrubColumn(scrubber, 'ticketForwardEvent', ids, ['reason']));
      add('timeLogs', await this.scrubColumn(scrubber, 'ticketTimeLog', ids, ['note', 'correctionReason', 'deleteReason']));
      add('approvals', await this.scrubColumn(scrubber, 'ticketApproval', ids, ['comment']));
      add('csat', await this.scrubColumn(scrubber, 'ticketCsat', ids, ['comment']));
      const activities = await this.prisma.ticketActivity.findMany({
        where: { ticketId: { in: ids }, NOT: { payload: { equals: DbNull } } },
        select: { id: true, payload: true },
      });
      for (const activity of activities) {
        const result = scrubber.scrubJson(activity.payload);
        if (result.count === 0) continue;
        await this.prisma.ticketActivity.update({ where: { id: activity.id }, data: { payload: result.value as never } });
        add('activities', 1);
      }
      // Notifications about these tickets (personal and group rows; the
      // person's own are deleted below). No userId filter: `NOT userId = u`
      // would also drop group rows (userId NULL) in SQL.
      const notifications = await this.prisma.notification.findMany({
        where: { ticketId: { in: ids } },
        select: { id: true, title: true, body: true, payload: true },
      });
      for (const notification of notifications) {
        const title = scrubber.scrub(notification.title);
        const body = notification.body === null ? null : scrubber.scrub(notification.body);
        const payload = scrubber.scrubJson(notification.payload);
        if (title.count + (body?.count ?? 0) + payload.count === 0) continue;
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: {
            title: title.text,
            body: body?.text ?? null,
            ...(payload.count > 0 ? { payload: payload.value as never } : {}),
          },
        });
        add('notificationsScrubbed', 1);
      }
    });

    // Attachments the person uploaded (kept by default: business content).
    const held = new Set(scope.held);
    const attachments = await this.prisma.ticketAttachment.findMany({
      where: { uploadedByUserId: u },
      select: { id: true, ticketId: true, originalName: true, storagePath: true },
    });
    for (const attachment of attachments) {
      if (held.has(attachment.ticketId)) continue;
      if (subject.deleteOwnAttachments) {
        await this.attachmentStorage.remove(attachment.storagePath);
        await this.prisma.ticketAttachment.delete({ where: { id: attachment.id } });
        add('attachmentsDeleted', 1);
        continue;
      }
      const name = scrubber.scrub(attachment.originalName);
      if (name.count > 0) {
        await this.prisma.ticketAttachment.update({ where: { id: attachment.id }, data: { originalName: name.text } });
        add('attachmentNames', 1);
      }
    }

    // Rows that only exist for the person: deleted.
    add('notificationsDeleted', (await this.prisma.notification.deleteMany({ where: { userId: u } })).count);
    add('notificationReceipts', (await this.prisma.notificationReceipt.deleteMany({ where: { userId: u } })).count);
    add('emailDeliveries', (await this.prisma.notificationEmailDelivery.deleteMany({ where: { userId: u } })).count);
    add('digestItems', (await this.prisma.notificationDigestItem.deleteMany({ where: { userId: u } })).count);
    add('notificationPreferences', (await this.prisma.userNotificationPreference.deleteMany({ where: { userId: u } })).count);
    add('notificationSchedule', (await this.prisma.userNotificationSchedule.deleteMany({ where: { userId: u } })).count);
    add('sessions', (await this.prisma.userSession.deleteMany({ where: { userId: u } })).count);
    add('mfa', (await this.prisma.userMfa.deleteMany({ where: { userId: u } })).count);
    add('recoveryCodes', (await this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId: u } })).count);
    add('passwordHistory', (await this.prisma.userPasswordHistory.deleteMany({ where: { userId: u } })).count);
    add('roles', (await this.prisma.userRole.deleteMany({ where: { userId: u } })).count);
    add('groups', (await this.prisma.groupMember.deleteMany({ where: { userId: u } })).count);
    add('savedViews', (await this.prisma.savedView.deleteMany({ where: { userId: u } })).count);
    add('personalTemplates', (await this.prisma.responseTemplate.deleteMany({ where: { ownerUserId: u } })).count);
    add(
      'followerLinks',
      (await this.prisma.ticketParticipant.deleteMany({ where: { userId: u, role: { in: ['FOLLOWER', 'WATCHER'] } } })).count,
    );
    add('confidentialGrants', (await this.prisma.ticketConfidentialGrant.deleteMany({ where: { userId: u } })).count);

    // Scheduled reports: remove the recipient, pause schedules left without one.
    const recipientRows = await this.prisma.reportScheduleRecipient.findMany({ where: { userId: u }, select: { scheduleId: true } });
    if (recipientRows.length > 0) {
      await this.prisma.reportScheduleRecipient.deleteMany({ where: { userId: u } });
      add('reportRecipients', recipientRows.length);
      const toPause = await this.prisma.reportSchedule.findMany({
        where: { id: { in: recipientRows.map((row) => row.scheduleId) }, enabled: true, recipients: { none: {} } },
        select: { id: true },
      });
      if (toPause.length > 0) {
        await this.prisma.reportSchedule.updateMany({
          where: { id: { in: toPause.map((row) => row.id) } },
          data: { enabled: false },
        });
        add('reportSchedulesPaused', toPause.length);
        pausedScheduleIds.push(...toPause.map((row) => row.id));
      }
    }

    // Manual directory entry of the person.
    add(
      'manualDirectoryUsers',
      (await this.prisma.manualDirectoryUser.deleteMany({ where: { email: { equals: subject.email, mode: 'insensitive' } } })).count,
    );

    // Inbound e-mail log: sender address and the raw .eml are removed.
    const inbound = await this.prisma.inboundEmail.findMany({
      where: { fromAddress: { equals: subject.email, mode: 'insensitive' } },
      select: { id: true, subject: true, rawStorageKey: true },
    });
    for (const row of inbound) {
      if (row.rawStorageKey !== null) await this.inboundRawStore.remove(row.rawStorageKey);
      await this.prisma.inboundEmail.update({
        where: { id: row.id },
        data: { fromAddress: null, rawStorageKey: null, subject: scrubber.scrub(row.subject).text.slice(0, 200) },
      });
      add('inboundEmails', 1);
    }

    // Change log entries about or by the person.
    const changeLogs = await this.prisma.changeLog.findMany({
      where: { OR: [{ entityId: u }, { actorUserId: u }] },
      select: { id: true, reason: true, diff: true },
    });
    for (const row of changeLogs) {
      const reason = scrubber.scrub(row.reason);
      const diff = scrubber.scrubJson(row.diff);
      if (reason.count + diff.count === 0) continue;
      await this.prisma.changeLog.update({
        where: { id: row.id },
        data: { reason: reason.text, ...(diff.count > 0 ? { diff: diff.value as never } : {}) },
      });
      add('changeLogs', 1);
    }
    return { counts, pausedScheduleIds };
  }

  private async scrubColumn(
    scrubber: TextScrubber,
    model: 'ticketForwardEvent' | 'ticketTimeLog' | 'ticketApproval' | 'ticketCsat',
    ticketIds: readonly string[],
    columns: readonly string[],
  ): Promise<number> {
    const delegate = this.prisma[model] as unknown as {
      findMany(args: unknown): Promise<Record<string, string | null>[]>;
      update(args: unknown): Promise<unknown>;
    };
    const select = Object.fromEntries([['id', true], ...columns.map((column) => [column, true])]);
    const rows = await delegate.findMany({ where: { ticketId: { in: [...ticketIds] } }, select });
    let changed = 0;
    for (const row of rows) {
      const data: Record<string, string> = {};
      for (const column of columns) {
        const value = row[column];
        if (typeof value !== 'string') continue;
        const result = scrubber.scrub(value);
        if (result.count > 0) data[column] = result.text;
      }
      if (Object.keys(data).length === 0) continue;
      await delegate.update({ where: { id: row.id }, data });
      changed += 1;
    }
    return changed;
  }

  private async forEachTicketChunk(ids: readonly string[], action: (chunk: string[]) => Promise<void>): Promise<void> {
    for (let index = 0; index < ids.length; index += ticketChunk) {
      await action(ids.slice(index, index + ticketChunk));
    }
  }

  private async forEachMessageChunk(
    ticketIds: readonly string[],
    action: (messages: { id: string; body: string }[]) => Promise<void>,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const messages = await this.prisma.ticketMessage.findMany({
        where: { ticketId: { in: [...ticketIds] } },
        select: { id: true, body: true },
        orderBy: { id: 'asc' },
        take: messageChunk,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });
      if (messages.length === 0) return;
      await action(messages);
      if (messages.length < messageChunk) return;
      cursor = messages[messages.length - 1].id;
    }
  }
}
