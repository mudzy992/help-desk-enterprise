import JSZip from 'jszip';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketAttachmentStorage } from '../../tickets/attachments/attachments.types';

const batch = 1000;

export type ExportBuildOptions = {
  readonly subjectUserId: string;
  readonly includeAttachments: boolean;
  readonly includeInternalNotes: boolean;
  readonly maxAttachmentBytes: number;
  readonly exportedByName: string;
  readonly now: Date;
};

export type ExportSummary = {
  readonly counts: Readonly<Record<string, number>>;
  readonly attachmentsIncluded: number;
  readonly attachmentsSkipped: number;
  readonly attachmentBytes: number;
};

const roleLabels: Readonly<Record<string, string>> = {
  USER_REPLY: 'User',
  AGENT_REPLY: 'Agent',
  SYSTEM_EVENT: 'System',
  INTERNAL_NOTE: 'Agent (internal note)',
};

/**
 * Paket 2.6 (§5.1): builds the data-subject export as a ZIP (JSON for
 * portability, CSV with BOM for tickets, README in bs/en). Queries run in
 * batches of 1000 over indexed columns (`requesterId`, `authorUserId`,
 * `actorUserId`, `userId`). Other people's internal notes are included only
 * when explicitly requested (with a reason, audited by the caller).
 */
export class ExportBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachmentStorage: TicketAttachmentStorage,
  ) {}

  async build(options: ExportBuildOptions): Promise<{ readonly zip: JSZip; readonly summary: ExportSummary }> {
    const zip = new JSZip();
    const counts: Record<string, number> = {};
    const u = options.subjectUserId;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: u },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        isLocalOnly: true,
        preferredLocale: true,
        keyboardShortcuts: true,
        company: true,
        department: true,
        distinguishedName: true,
        createdAt: true,
        anonymizedAt: true,
        organizationalUnit: { select: { name: true, ouPath: true } },
        manager: { select: { displayName: true } },
        userRoles: { select: { role: { select: { key: true } } } },
        groupMembers: { select: { group: { select: { name: true } } } },
        mfa: { select: { enabledAt: true } },
      },
    });
    const preferences = await this.prisma.userNotificationPreference.findMany({
      where: { userId: u },
      select: { category: true, inApp: true, email: true },
    });
    zip.file(
      'profile.json',
      json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        active: user.isActive,
        accountSource: user.isLocalOnly ? 'local' : 'directory',
        preferredLocale: user.preferredLocale,
        keyboardShortcuts: user.keyboardShortcuts,
        company: user.company,
        department: user.department,
        distinguishedName: user.distinguishedName,
        organizationalUnit: user.organizationalUnit,
        manager: user.manager?.displayName ?? null,
        roles: user.userRoles.map((row) => row.role.key),
        groups: user.groupMembers.map((row) => row.group.name),
        mfaEnabled: user.mfa?.enabledAt != null,
        createdAt: user.createdAt,
        anonymizedAt: user.anonymizedAt,
        notificationPreferences: preferences,
      }),
    );

    // Tickets where the person is the requester.
    const tickets: Record<string, unknown>[] = [];
    const ticketNumbers = new Map<string, string>();
    await paginate(
      (cursor) =>
        this.prisma.ticket.findMany({
          where: { requesterId: u, id: { gt: cursor ?? '' } },
          orderBy: { id: 'asc' },
          take: batch,
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            description: true,
            formData: true,
            status: true,
            priority: true,
            createdAt: true,
            resolvedAt: true,
            closedAt: true,
            resolutionNote: true,
            service: { select: { name: true } },
            csat: { select: { rating: true, comment: true, createdAt: true } },
          },
        }),
      async (rows) => {
        for (const row of rows) {
          ticketNumbers.set(row.id, row.ticketNumber);
          tickets.push({
            ticketNumber: row.ticketNumber,
            service: row.service.name,
            title: row.title,
            description: row.description,
            form: row.formData,
            status: row.status,
            priority: row.priority,
            createdAt: row.createdAt,
            resolvedAt: row.resolvedAt,
            closedAt: row.closedAt,
            resolutionNote: row.resolutionNote,
            satisfaction: row.csat,
          });
        }
      },
    );
    counts.tickets = tickets.length;
    zip.file('tickets.json', json(tickets));
    zip.file('tickets.csv', csv(
      ['ticketNumber', 'service', 'title', 'status', 'priority', 'createdAt', 'resolvedAt', 'closedAt', 'satisfaction'],
      tickets.map((t) => [
        t.ticketNumber,
        t.service,
        t.title,
        t.status,
        t.priority,
        t.createdAt,
        t.resolvedAt,
        t.closedAt,
        (t.satisfaction as { rating: number } | null)?.rating ?? '',
      ]),
    ));

    // Messages on those tickets: public ones (+ others' internal notes when requested).
    const messageTypes = ['USER_REPLY', 'AGENT_REPLY', 'SYSTEM_EVENT', ...(options.includeInternalNotes ? ['INTERNAL_NOTE'] : [])];
    const messages: unknown[] = [];
    const ticketIds = [...ticketNumbers.keys()];
    for (let index = 0; index < ticketIds.length; index += batch) {
      const chunk = ticketIds.slice(index, index + batch);
      await paginate(
        (cursor) =>
          this.prisma.ticketMessage.findMany({
            where: { ticketId: { in: chunk }, type: { in: messageTypes as never }, id: { gt: cursor ?? '' } },
            orderBy: { id: 'asc' },
            take: batch,
              select: { id: true, ticketId: true, type: true, body: true, authorUserId: true, createdAt: true },
          }),
        async (rows) => {
          for (const row of rows) {
            messages.push({
              ticketNumber: ticketNumbers.get(row.ticketId),
              type: row.type,
              author: row.authorUserId === u ? user.displayName : roleLabels[row.type] ?? 'Agent',
              body: row.body,
              createdAt: row.createdAt,
            });
          }
        },
      );
    }
    counts.messages = messages.length;
    zip.file('messages.json', json(messages));

    // Everything the person wrote (the agent is a data subject too).
    const authored: unknown[] = [];
    await paginate(
      (cursor) =>
        this.prisma.ticketMessage.findMany({
          where: { authorUserId: u, id: { gt: cursor ?? '' } },
          orderBy: { id: 'asc' },
          take: batch,
          select: { id: true, type: true, body: true, createdAt: true, ticket: { select: { ticketNumber: true } } },
        }),
      async (rows) => {
        for (const row of rows) {
          authored.push({ ticketNumber: row.ticket.ticketNumber, type: row.type, body: row.body, createdAt: row.createdAt });
        }
      },
    );
    counts.authored = authored.length;
    zip.file('authored.json', json(authored));

    // Actions, time logs and mentions.
    const actions: unknown[] = [];
    await paginate(
      (cursor) =>
        this.prisma.ticketActivity.findMany({
          where: { actorUserId: u, id: { gt: cursor ?? '' } },
          orderBy: { id: 'asc' },
          take: batch,
          select: { id: true, action: true, payload: true, createdAt: true, ticket: { select: { ticketNumber: true } } },
        }),
      async (rows) => {
        for (const row of rows) {
          actions.push({ ticketNumber: row.ticket.ticketNumber, action: row.action, details: row.payload, createdAt: row.createdAt });
        }
      },
    );
    const timeLogs = await this.prisma.ticketTimeLog.findMany({
      where: { userId: u },
      orderBy: { startedAt: 'asc' },
      select: {
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
        source: true,
        note: true,
        deletedAt: true,
        ticket: { select: { ticketNumber: true } },
      },
    });
    const mentions = await this.prisma.ticketMessageMention.findMany({
      where: { userId: u },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, ticket: { select: { ticketNumber: true } } },
    });
    counts.actions = actions.length;
    counts.timeLogs = timeLogs.length;
    counts.mentions = mentions.length;
    zip.file(
      'activity.json',
      json({
        actions,
        timeLogs: timeLogs.map(({ ticket, ...row }) => ({ ticketNumber: ticket.ticketNumber, ...row })),
        mentions: mentions.map((row) => ({ ticketNumber: row.ticket.ticketNumber, createdAt: row.createdAt })),
      }),
    );

    const sessions = await this.prisma.userSession.findMany({
      where: { userId: u },
      orderBy: { createdAt: 'asc' },
      select: {
        provider: true,
        mfaMethod: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    });
    counts.sessions = sessions.length;
    zip.file('sessions.json', json(sessions));

    const notifications = await this.prisma.notification.findMany({
      where: { userId: u },
      orderBy: { createdAt: 'asc' },
      select: { type: true, title: true, body: true, isRead: true, readAt: true, createdAt: true },
    });
    counts.notifications = notifications.length;
    zip.file('notifications.json', json(notifications));

    // Paket 2.9 (K3): on-call rotations, overrides and swap requests of the person.
    const [onCallRotations, onCallOverrides, onCallSwaps] = await Promise.all([
      this.prisma.onCallRotationMember.findMany({
        where: { userId: u },
        select: { position: true, schedule: { select: { group: { select: { name: true } } } } },
      }),
      this.prisma.onCallOverride.findMany({
        where: { userId: u },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true, endsAt: true, reason: true, createdAt: true, schedule: { select: { group: { select: { name: true } } } } },
      }),
      this.prisma.onCallSwapRequest.findMany({
        where: { OR: [{ requesterId: u }, { colleagueId: u }] },
        orderBy: { createdAt: 'asc' },
        select: {
          requesterId: true,
          startsAt: true,
          endsAt: true,
          reason: true,
          status: true,
          decidedAt: true,
          createdAt: true,
          schedule: { select: { group: { select: { name: true } } } },
        },
      }),
    ]);
    counts.onCall = onCallRotations.length + onCallOverrides.length + onCallSwaps.length;
    zip.file(
      'on-call.json',
      json({
        rotations: onCallRotations.map(({ schedule, ...row }) => ({ group: schedule.group.name, ...row })),
        overrides: onCallOverrides.map(({ schedule, ...row }) => ({ group: schedule.group.name, ...row })),
        swapRequests: onCallSwaps.map(({ schedule, requesterId, ...row }) => ({
          group: schedule.group.name,
          role: requesterId === u ? 'requester' : 'colleague',
          ...row,
        })),
      }),
    );

    // Paket 2.9 (K2): announcements the person acknowledged or closed.
    const [announcementAcks, announcementDismissals] = await Promise.all([
      this.prisma.announcementAcknowledgement.findMany({
        where: { userId: u },
        orderBy: { acknowledgedAt: 'asc' },
        select: { acknowledgedAt: true, announcement: { select: { title: true, startsAt: true, endsAt: true } } },
      }),
      this.prisma.announcementDismissal.findMany({
        where: { userId: u },
        orderBy: { dismissedAt: 'asc' },
        select: { dismissedAt: true, announcement: { select: { title: true, startsAt: true, endsAt: true } } },
      }),
    ]);
    counts.announcements = announcementAcks.length + announcementDismissals.length;
    zip.file(
      'announcements.json',
      json({
        acknowledgements: announcementAcks.map(({ announcement, ...row }) => ({ ...announcement, ...row })),
        dismissals: announcementDismissals.map(({ announcement, ...row }) => ({ ...announcement, ...row })),
      }),
    );

    const audit: unknown[] = [];
    await paginate(
      (cursor) =>
        this.prisma.auditLog.findMany({
          where: { OR: [{ actorUserId: u }, { entityId: u }], id: { gt: cursor ?? '' } },
          orderBy: { id: 'asc' },
          take: batch,
          select: { id: true, action: true, entityType: true, entityId: true, actorUserId: true, metadata: true, createdAt: true },
        }),
      async (rows) => {
        for (const row of rows) {
          audit.push({
            action: row.action,
            entityType: row.entityType,
            aboutYou: row.entityId === u,
            byYou: row.actorUserId === u,
            details: row.metadata,
            createdAt: row.createdAt,
          });
        }
      },
    );
    counts.audit = audit.length;
    zip.file('audit.json', json(audit));

    // Attachments the person uploaded (within the size budget).
    let attachmentsIncluded = 0;
    let attachmentsSkipped = 0;
    let attachmentBytes = 0;
    const skipped: unknown[] = [];
    if (options.includeAttachments) {
      const attachments = await this.prisma.ticketAttachment.findMany({
        where: { uploadedByUserId: u },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          originalName: true,
          storagePath: true,
          sizeBytes: true,
          ticket: { select: { ticketNumber: true } },
        },
      });
      for (const attachment of attachments) {
        if (attachmentBytes + attachment.sizeBytes > options.maxAttachmentBytes) {
          attachmentsSkipped += 1;
          skipped.push({ ticketNumber: attachment.ticket.ticketNumber, name: attachment.originalName, reason: 'size_limit' });
          continue;
        }
        const contents = await this.attachmentStorage.read(attachment.storagePath).catch(() => null);
        if (contents === null) {
          attachmentsSkipped += 1;
          skipped.push({ ticketNumber: attachment.ticket.ticketNumber, name: attachment.originalName, reason: 'file_missing' });
          continue;
        }
        zip.file(`attachments/${safeName(attachment.ticket.ticketNumber)}/${attachment.id}-${safeName(attachment.originalName)}`, contents);
        attachmentsIncluded += 1;
        attachmentBytes += contents.length;
      }
      if (skipped.length > 0) zip.file('attachments/skipped.json', json(skipped));
    }

    zip.file('README.txt', readme(options, counts, { attachmentsIncluded, attachmentsSkipped }));
    return { zip, summary: { counts, attachmentsIncluded, attachmentsSkipped, attachmentBytes } };
  }
}

async function paginate<T extends { id: string }>(
  load: (cursor: string | undefined) => Promise<T[]>,
  handle: (rows: T[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await load(cursor);
    if (rows.length === 0) return;
    await handle(rows);
    if (rows.length < batch) return;
    cursor = rows[rows.length - 1].id;
  }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item), 2)}\n`;
}

export function csv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const cell = (value: unknown) => {
    const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? '' : String(value);
    // Neutralise spreadsheet formulas (CSV injection).
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;
}

/** Control characters (U+0000–U+001F) → '_', without a control-character regex (no-control-regex). */
function stripControlCharacters(value: string): string {
  let out = '';
  for (const char of value) out += char.charCodeAt(0) < 0x20 ? '_' : char;
  return out;
}

export function safeName(value: string): string {
  const cleaned = stripControlCharacters(value.normalize('NFC'))
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  return (cleaned.length === 0 ? 'file' : cleaned).slice(0, 120);
}

function readme(
  options: ExportBuildOptions,
  counts: Readonly<Record<string, number>>,
  attachments: { attachmentsIncluded: number; attachmentsSkipped: number },
): string {
  const date = options.now.toISOString();
  const list = Object.entries(counts)
    .map(([key, value]) => `  - ${key}: ${value}`)
    .join('\n');
  const notes = options.includeInternalNotes ? 'uključene / included' : 'nisu uključene / not included';
  return [
    'IZVOZ LIČNIH PODATAKA / PERSONAL DATA EXPORT',
    '',
    `Datum / Date: ${date}`,
    `Izvezao / Exported by: ${options.exportedByName}`,
    '',
    'BOSANSKI',
    'Paket sadrži lične podatke koje sistem za podršku (help desk) obrađuje o vama, u mašinski',
    'čitljivom formatu (JSON; tiketi i u CSV formatu, UTF-8). Fajlovi:',
    '  profile.json – profil, organizaciona jedinica, uloge, grupe, postavke obavještenja',
    '  tickets.json / tickets.csv – tiketi koje ste podnijeli',
    '  messages.json – javne poruke na vašim tiketima (drugi autori su prikazani ulogom)',
    '  authored.json – poruke i bilješke koje ste vi napisali',
    '  activity.json – vaše radnje na tiketima, evidencija vremena, spominjanja',
    '  sessions.json – prijave (vrijeme, IP adresa, preglednik)',
    '  notifications.json – obavještenja',
    '  audit.json – zapisi revizije gdje ste akter ili predmet',
    '  attachments/ – prilozi koje ste vi priložili',
    `Interne bilješke drugih zaposlenih: ${notes.split(' / ')[0]}. One su izostavljene zadano radi zaštite`,
    'prava drugih lica. Podaci obrisani po politici zadržavanja više ne postoje i nisu u paketu.',
    '',
    'ENGLISH',
    'This package contains the personal data the help desk processes about you, in a',
    'machine-readable format (JSON; tickets also as CSV, UTF-8). See the file list above.',
    `Internal notes written by other staff: ${notes.split(' / ')[1]}. They are omitted by default to`,
    'protect the rights of others. Data deleted under the retention policy no longer exists.',
    '',
    'Broj zapisa / Record counts:',
    list,
    `  - attachments: ${attachments.attachmentsIncluded} (preskočeno / skipped: ${attachments.attachmentsSkipped})`,
    '',
  ].join('\n');
}
