import { authenticationConstants } from '../../authentication/authentication.constants';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { permissionKeys } from '../../authorization/authorization.constants';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../../notifications/notifications.constants';
import type { PrivacyActor } from '../privacy-actor';
import { PrivacyConfigurationLoader } from '../privacy-configuration.loader';
import {
  closedRequestStatuses,
  privacyErrorCodes,
  privacyLimits,
  type DataSubjectRequestChannel,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from '../privacy.constants';
import { PrivacyError } from '../privacy.error';
import { computeDueAt, computeExtendedDueAt, daysLeft, dueReminderRung, effectiveDueAt } from '../request-deadlines';
import type {
  CloseDataSubjectRequestDto,
  CreateDataSubjectRequestDto,
  UpdateDataSubjectRequestDto,
} from './data-subject-request.dto';

export type DataSubjectRequestView = {
  readonly id: string;
  readonly type: DataSubjectRequestType;
  readonly status: DataSubjectRequestStatus;
  readonly channel: DataSubjectRequestChannel;
  readonly subjectLabel: string;
  readonly subjectUser: { readonly id: string; readonly displayName: string } | null;
  readonly handlerUser: { readonly id: string; readonly displayName: string } | null;
  readonly receivedAt: string;
  readonly dueAt: string;
  readonly extendedDueAt: string | null;
  readonly effectiveDueAt: string;
  /** Whole days left (negative = overdue); null once closed. */
  readonly daysLeft: number | null;
  readonly canExtend: boolean;
  readonly extensionReason: string | null;
  readonly rejectionReason: string | null;
  readonly notes: string | null;
  readonly resultRef: string | null;
  readonly closedAt: string | null;
  readonly createdAt: string;
};

const requestSelect = {
  id: true,
  type: true,
  status: true,
  channel: true,
  subjectLabel: true,
  subjectUserId: true,
  handlerUserId: true,
  receivedAt: true,
  dueAt: true,
  extendedDueAt: true,
  extensionReason: true,
  rejectionReason: true,
  notes: true,
  resultRef: true,
  remindersSent: true,
  closedAt: true,
  createdAt: true,
} as const;

type RequestRecord = {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly channel: string;
  readonly subjectLabel: string;
  readonly subjectUserId: string | null;
  readonly handlerUserId: string | null;
  readonly receivedAt: Date;
  readonly dueAt: Date;
  readonly extendedDueAt: Date | null;
  readonly extensionReason: string | null;
  readonly rejectionReason: string | null;
  readonly notes: string | null;
  readonly resultRef: string | null;
  readonly remindersSent: number[];
  readonly closedAt: Date | null;
  readonly createdAt: Date;
};

/** Future receipt dates are refused; a letter may arrive with a past date (max one year back). */
const maxBackdateMs = 366 * 24 * 60 * 60 * 1000;
const clockSkewMs = 5 * 60 * 1000;

/**
 * Paket 2.6 (§4): register of data subject requests (ZZLP čl. 14, 17–24).
 * Personal data of the subject never goes into audit metadata — only ids,
 * type and status.
 */
@Injectable()
export class DataSubjectRequestsService {
  private readonly logger = new Logger(DataSubjectRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
  ) {}

  async list(scope: 'open' | 'closed' | 'all' = 'open', now: Date = new Date()): Promise<DataSubjectRequestView[]> {
    const closed = [...closedRequestStatuses];
    const rows = (await this.prisma.dataSubjectRequest.findMany({
      where:
        scope === 'open' ? { status: { notIn: closed } } : scope === 'closed' ? { status: { in: closed } } : {},
      orderBy: scope === 'open' ? [{ dueAt: 'asc' }, { id: 'asc' }] : [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: privacyLimits.requestsListed,
      select: requestSelect,
    })) as RequestRecord[];
    const views = await this.toViews(rows, now);
    // Open requests: nearest effective deadline first (an extension moves a row down).
    return scope === 'open'
      ? views.sort((a, b) => a.effectiveDueAt.localeCompare(b.effectiveDueAt) || a.id.localeCompare(b.id))
      : views;
  }

  async get(id: string, now: Date = new Date()): Promise<DataSubjectRequestView> {
    const [view] = await this.toViews([await this.load(id)], now);
    return view;
  }

  async create(
    input: CreateDataSubjectRequestDto,
    actor: PrivacyActor,
    now: Date = new Date(),
  ): Promise<DataSubjectRequestView> {
    const receivedAt = new Date(input.receivedAt);
    if (
      Number.isNaN(receivedAt.getTime()) ||
      receivedAt.getTime() > now.getTime() + clockSkewMs ||
      now.getTime() - receivedAt.getTime() > maxBackdateMs
    ) {
      throw new PrivacyError(privacyErrorCodes.invalidInput, { field: 'receivedAt' });
    }
    await this.assertUsersExist([input.subjectUserId, input.handlerUserId]);
    const created = (await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.dataSubjectRequest.create({
        data: {
          type: input.type,
          status: 'RECEIVED',
          channel: input.channel,
          subjectLabel: input.subjectLabel,
          subjectUserId: input.subjectUserId ?? null,
          handlerUserId: input.handlerUserId ?? null,
          notes: emptyToNull(input.notes),
          receivedAt,
          dueAt: computeDueAt(receivedAt),
          createdByUserId: actor.principal.subjectId,
        },
        select: requestSelect,
      });
      await recordAuditEntry(transaction as never, {
        action: auditLogActions.privacyRequestCreated,
        entityType: auditLogEntityTypes.dataSubjectRequest,
        entityId: row.id,
        metadata: { type: row.type, channel: row.channel, dueAt: row.dueAt.toISOString() },
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
      });
      return row;
    })) as RequestRecord;
    const [view] = await this.toViews([created], now);
    return view;
  }

  async update(
    id: string,
    input: UpdateDataSubjectRequestDto,
    actor: PrivacyActor,
    now: Date = new Date(),
  ): Promise<DataSubjectRequestView> {
    const current = await this.load(id);
    assertOpen(current);
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    if (input.status === 'IN_PROGRESS' && current.status === 'RECEIVED') {
      data.status = 'IN_PROGRESS';
      changed.push('status');
    } else if (input.status !== undefined && input.status !== current.status && current.status !== 'EXTENDED') {
      throw new PrivacyError(privacyErrorCodes.invalidTransition);
    }
    if (input.subjectUserId !== undefined && input.subjectUserId !== current.subjectUserId) {
      await this.assertUsersExist([input.subjectUserId]);
      data.subjectUserId = input.subjectUserId;
      changed.push('subjectUserId');
    }
    if (input.handlerUserId !== undefined && input.handlerUserId !== current.handlerUserId) {
      await this.assertUsersExist([input.handlerUserId]);
      data.handlerUserId = input.handlerUserId;
      changed.push('handlerUserId');
    }
    if (input.notes !== undefined && emptyToNull(input.notes) !== current.notes) {
      data.notes = emptyToNull(input.notes);
      changed.push('notes');
    }
    if (changed.length === 0) return this.get(id, now);
    return this.mutate(id, data, actor, auditLogActions.privacyRequestUpdated, { changed }, now);
  }

  /** ZZLP čl. 14(3): once, by 60 days, before the original deadline passes. */
  async extend(id: string, reason: string, actor: PrivacyActor, now: Date = new Date()): Promise<DataSubjectRequestView> {
    const current = await this.load(id);
    assertOpen(current);
    const extendedDueAt = computeExtendedDueAt({ dueAt: current.dueAt, extendedDueAt: current.extendedDueAt, now });
    if (extendedDueAt === null) throw new PrivacyError(privacyErrorCodes.extensionNotAllowed);
    return this.mutate(
      id,
      // Reminders restart against the new deadline.
      { status: 'EXTENDED', extendedDueAt, extensionReason: reason, remindersSent: [] },
      actor,
      auditLogActions.privacyRequestExtended,
      { extendedDueAt: extendedDueAt.toISOString() },
      now,
    );
  }

  async close(
    id: string,
    input: CloseDataSubjectRequestDto,
    actor: PrivacyActor,
    now: Date = new Date(),
  ): Promise<DataSubjectRequestView> {
    const current = await this.load(id);
    assertOpen(current);
    const rejectionReason = emptyToNull(input.rejectionReason);
    if (input.outcome === 'REJECTED' && (rejectionReason === null || rejectionReason.length < 10)) {
      throw new PrivacyError(privacyErrorCodes.invalidInput, { field: 'rejectionReason' });
    }
    const due = effectiveDueAt(current);
    return this.mutate(
      id,
      {
        status: input.outcome,
        closedAt: now,
        rejectionReason: input.outcome === 'REJECTED' ? rejectionReason : null,
        resultRef: emptyToNull(input.resultRef) ?? current.resultRef,
      },
      actor,
      auditLogActions.privacyRequestClosed,
      { outcome: input.outcome, onTime: now.getTime() <= due.getTime() },
      now,
    );
  }

  /** Links an export or erasure to the request (called by those services). */
  async attachResult(id: string, resultRef: string): Promise<void> {
    await this.prisma.dataSubjectRequest.updateMany({
      where: { id, status: { notIn: [...closedRequestStatuses] } },
      data: { resultRef: resultRef.slice(0, 300) },
    });
  }

  /**
   * Scheduled (every 15 min): in-app reminder to the handler — or, without one,
   * to everybody holding `privacy.manage` — when a deadline rung (7 d, 1 d) is
   * reached. Each rung is sent once per deadline; the claim is atomic, so two
   * workers never send the same reminder.
   */
  async sendDueReminders(now: Date = new Date()): Promise<number> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled || configuration.reminderDays.length === 0) return 0;
    const horizon = new Date(now.getTime() + (Math.max(...configuration.reminderDays) + 1) * 86_400_000);
    const rows = (await this.prisma.dataSubjectRequest.findMany({
      where: {
        status: { notIn: [...closedRequestStatuses] },
        OR: [{ extendedDueAt: null, dueAt: { lte: horizon } }, { extendedDueAt: { lte: horizon } }],
      },
      orderBy: { dueAt: 'asc' },
      take: privacyLimits.requestsListed,
      select: requestSelect,
    })) as RequestRecord[];
    let managers: string[] | null = null;
    let sent = 0;
    for (const row of rows) {
      const due = effectiveDueAt(row);
      const rung = dueReminderRung({ dueAt: due, now, ladder: configuration.reminderDays, sent: row.remindersSent });
      if (rung === null) continue;
      // Every rung at or above this one counts as sent (a late job sends only the closest).
      const covered = configuration.reminderDays.filter((value) => value >= rung);
      const claimed = await this.prisma.dataSubjectRequest.updateMany({
        where: { id: row.id, remindersSent: { equals: row.remindersSent }, status: row.status },
        data: { remindersSent: [...new Set([...row.remindersSent, ...covered])].sort((a, b) => b - a) },
      });
      if (claimed.count === 0) continue;
      const recipients =
        row.handlerUserId !== null && (await this.isActiveManager(row.handlerUserId))
          ? [row.handlerUserId]
          : (managers ??= await this.activeManagerIds());
      const left = daysLeft(due, now);
      for (const userId of recipients) {
        await persistInAppNotification(this.prisma, {
          userId,
          type: notificationTypes.privacyRequestDue,
          title: 'notifications.items.privacyRequestDue',
          // No personal data in the notification body: type and days left only.
          body: `${row.type}:${left}`,
          ticketId: null,
          payload: {
            ticketId: '',
            ticketNumber: '',
            event: notificationTypes.privacyRequestDue,
            messageId: `privacy-request-due:${row.id}:${due.toISOString()}:${rung}`,
            actorUserId: null,
            confidential: false,
            requestId: row.id,
            requestType: row.type,
            daysLeft: left,
          } as never,
          dedupeKey: `privacy-request-due:${row.id}:${due.toISOString()}:${rung}:${userId}`,
        }).catch((error: unknown) =>
          this.logger.warn(`privacy_request_reminder_failed request=${row.id} reason=${String(error)}`),
        );
      }
      sent += 1;
    }
    return sent;
  }

  private async mutate(
    id: string,
    data: Record<string, unknown>,
    actor: PrivacyActor,
    action: string,
    metadata: Record<string, unknown>,
    now: Date,
  ): Promise<DataSubjectRequestView> {
    const updated = (await this.prisma.$transaction(async (transaction) => {
      // Optimistic guard: a request closed meanwhile is not modified.
      const result = await transaction.dataSubjectRequest.updateMany({
        where: { id, status: { notIn: [...closedRequestStatuses] } },
        data: data as never,
      });
      if (result.count === 0) throw new PrivacyError(privacyErrorCodes.invalidTransition);
      await recordAuditEntry(transaction as never, {
        action,
        entityType: auditLogEntityTypes.dataSubjectRequest,
        entityId: id,
        metadata: metadata as never,
        actorUserId: actor.principal.subjectId,
        requestId: actor.requestId,
      });
      return transaction.dataSubjectRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
    })) as RequestRecord;
    const [view] = await this.toViews([updated], now);
    return view;
  }

  private async load(id: string): Promise<RequestRecord> {
    const row = (await this.prisma.dataSubjectRequest.findUnique({
      where: { id },
      select: requestSelect,
    })) as RequestRecord | null;
    if (row === null) throw new PrivacyError(privacyErrorCodes.notFound);
    return row;
  }

  private async assertUsersExist(ids: readonly (string | null | undefined)[]): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if (wanted.length === 0) return;
    const count = await this.prisma.user.count({ where: { id: { in: wanted } } });
    if (count !== wanted.length) throw new PrivacyError(privacyErrorCodes.invalidInput, { field: 'userId' });
  }

  private managerWhere() {
    return {
      isActive: true,
      // SUPER_ADMIN holds every permission implicitly (no RolePermission rows).
      userRoles: {
        some: {
          role: {
            OR: [
              { key: authenticationConstants.superAdminRoleKey },
              { rolePermissions: { some: { permission: { key: permissionKeys.privacyManage } } } },
            ],
          },
        },
      },
    };
  }

  private async activeManagerIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({ where: this.managerWhere(), select: { id: true }, take: 50 });
    return rows.map((row) => row.id);
  }

  private async isActiveManager(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId, ...this.managerWhere() } })) > 0;
  }

  private async toViews(rows: readonly RequestRecord[], now: Date): Promise<DataSubjectRequestView[]> {
    const userIds = [
      ...new Set(rows.flatMap((row) => [row.subjectUserId, row.handlerUserId]).filter((id): id is string => id !== null)),
    ];
    const users =
      userIds.length === 0
        ? []
        : await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
    const names = new Map(users.map((user) => [user.id, user.displayName]));
    const userRef = (id: string | null) => (id === null ? null : { id, displayName: names.get(id) ?? '—' });
    return rows.map((row) => {
      const due = effectiveDueAt(row);
      const open = !closedRequestStatuses.includes(row.status as DataSubjectRequestStatus);
      return {
        id: row.id,
        type: row.type as DataSubjectRequestType,
        status: row.status as DataSubjectRequestStatus,
        channel: row.channel as DataSubjectRequestChannel,
        subjectLabel: row.subjectLabel,
        subjectUser: userRef(row.subjectUserId),
        handlerUser: userRef(row.handlerUserId),
        receivedAt: row.receivedAt.toISOString(),
        dueAt: row.dueAt.toISOString(),
        extendedDueAt: row.extendedDueAt?.toISOString() ?? null,
        effectiveDueAt: due.toISOString(),
        daysLeft: open ? daysLeft(due, now) : null,
        canExtend: open && computeExtendedDueAt({ dueAt: row.dueAt, extendedDueAt: row.extendedDueAt, now }) !== null,
        extensionReason: row.extensionReason,
        rejectionReason: row.rejectionReason,
        notes: row.notes,
        resultRef: row.resultRef,
        closedAt: row.closedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}

function assertOpen(row: RequestRecord): void {
  if (closedRequestStatuses.includes(row.status as DataSubjectRequestStatus)) {
    throw new PrivacyError(privacyErrorCodes.invalidTransition);
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
