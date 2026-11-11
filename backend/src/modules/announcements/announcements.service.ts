import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { appendAuditLog } from '../audit-log/append-audit-log';
import type { AuditLogTransactionalClient, AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import type { JsonValue } from '../change-log/change-log.types';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTitleKeys, notificationTypes, type NotificationType } from '../notifications/notifications.constants';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { announcementDefaults } from '../settings/definitions/announcement-settings';
import { settingKeys } from '../settings/setting-keys';
import { resolveAnnouncementTeamsUrl } from './announcement-teams-url';
import { SettingsService } from '../settings/settings.service';
import {
  csvCell,
  effectiveAnnouncementStatus,
  expandAudienceUnits,
  isAudienceWithinUnit,
  isInAnnouncementAudience,
  type AnnouncementAudience,
} from './announcement-audience';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementError, announcementErrorCodes, announcementLimits } from './announcements.constants';

const dayMs = 86_400_000;

export type SaveAnnouncementInput = {
  readonly title: string;
  readonly body: string;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly displayMode: 'BANNER' | 'MODAL';
  readonly requiresAcknowledgement: boolean;
  readonly notifyAudience: boolean;
  /** K2b: also by e-mail (only with notifyAudience). */
  readonly sendEmail?: boolean;
  /** K2b: Adaptive Card to the Teams channel (only when Teams is enabled). */
  readonly postToTeams?: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly serviceId?: string | null;
  readonly roles: readonly string[];
  readonly organizationalUnitIds: readonly string[];
  readonly groupIds: readonly string[];
};

type AnnouncementRow = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly displayMode: 'BANNER' | 'MODAL';
  readonly requiresAcknowledgement: boolean;
  readonly notifyAudience: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly audienceRoles: string[];
  readonly audienceOrganizationalUnitIds: string[];
  readonly audienceGroupIds: string[];
  readonly serviceId: string | null;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';
  readonly version: number;
  readonly createdById: string | null;
  readonly publishedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly audienceSizeAtPublish: number | null;
  readonly anonymizedAcknowledgements: number;
  readonly audienceNotifiedAt: Date | null;
  readonly lastReminderAt: Date | null;
  readonly sendEmail: boolean;
  readonly postToTeams: boolean;
  readonly teamsPostedAt: Date | null;
  readonly teamsResult: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type Unit = { readonly id: string; readonly name: string; readonly ouPath: string };

function audienceOf(row: Pick<AnnouncementRow, 'audienceRoles' | 'audienceOrganizationalUnitIds' | 'audienceGroupIds'>): AnnouncementAudience {
  return { roles: row.audienceRoles, organizationalUnitIds: row.audienceOrganizationalUnitIds, groupIds: row.audienceGroupIds };
}

function parseInstant(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AnnouncementError(announcementErrorCodes.invalid, field);
  return date;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/**
 * Paket 2.9 (K2, §3): announcements. The active list is computed per request
 * from a handful of rows (active announcements are few), so there is no cache
 * to invalidate: a withdrawal disappears on the client's next poll.
 */
@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async readSetting<T>(key: string, fallback: T): Promise<T> {
    try {
      const value = await this.settings.getSetting(key);
      return value === undefined || value === null ? fallback : (value as T);
    } catch {
      return fallback;
    }
  }

  async isEnabled(): Promise<boolean> {
    return (await this.readSetting<unknown>(settingKeys.privateAnnouncementsEnabled, announcementDefaults.enabled)) === true;
  }

  private async requireEnabled(): Promise<void> {
    if (!(await this.isEnabled())) throw new AnnouncementError(announcementErrorCodes.disabled);
  }

  private async loadUnits(): Promise<Unit[]> {
    return this.prisma.organizationalUnit.findMany({ select: { id: true, name: true, ouPath: true } });
  }

  private async unitPathOf(unitId: string | null): Promise<string | null> {
    if (unitId === null) return null;
    const unit = await this.prisma.organizationalUnit.findUnique({ where: { id: unitId }, select: { ouPath: true } });
    return unit?.ouPath ?? null;
  }

  /** What the viewer may do in the management screen. */
  async capabilities(viewer: AnnouncementViewer): Promise<{ canManage: boolean; scopedToUnit: boolean; canReadReports: boolean }> {
    if (viewer.canManageAll) return { canManage: true, scopedToUnit: false, canReadReports: viewer.canReadReports };
    const agentsMayPublish =
      viewer.isAgent &&
      viewer.homeOrganizationalUnitId !== null &&
      (await this.readSetting<unknown>(settingKeys.privateAnnouncementsAgentsMayPublish, announcementDefaults.agentsMayPublish)) === true;
    return { canManage: agentsMayPublish, scopedToUnit: agentsMayPublish, canReadReports: viewer.canReadReports || agentsMayPublish };
  }

  private async requireManage(viewer: AnnouncementViewer) {
    await this.requireEnabled();
    const capabilities = await this.capabilities(viewer);
    if (!capabilities.canManage) throw new AnnouncementError(announcementErrorCodes.forbidden);
    return capabilities;
  }

  /** Loads an announcement the viewer may manage (agents: audience inside the own unit). */
  private async loadManaged(id: string, viewer: AnnouncementViewer, scopedToUnit: boolean): Promise<AnnouncementRow> {
    const row = (await this.prisma.announcement.findUnique({ where: { id } })) as AnnouncementRow | null;
    if (row === null) throw new AnnouncementError(announcementErrorCodes.notFound);
    if (scopedToUnit) {
      const units = await this.loadUnits();
      const paths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
      const ownPath = await this.unitPathOf(viewer.homeOrganizationalUnitId);
      if (!isAudienceWithinUnit(row.audienceOrganizationalUnitIds, ownPath, paths)) {
        throw new AnnouncementError(announcementErrorCodes.notFound);
      }
    }
    return row;
  }

  // ------------------------------------------------------------ user side

  private async viewerUnitPath(viewer: AnnouncementViewer): Promise<string | null> {
    return this.unitPathOf(viewer.homeOrganizationalUnitId);
  }

  private async audienceUnitPaths(rows: readonly AnnouncementRow[]): Promise<Map<string, string>> {
    const ids = unique(rows.flatMap((row) => row.audienceOrganizationalUnitIds));
    if (ids.length === 0) return new Map();
    const units = await this.prisma.organizationalUnit.findMany({ where: { id: { in: ids } }, select: { id: true, ouPath: true } });
    return new Map(units.map((unit) => [unit.id, unit.ouPath]));
  }

  private async filterForViewer(rows: AnnouncementRow[], viewer: AnnouncementViewer): Promise<AnnouncementRow[]> {
    if (rows.length === 0) return rows;
    const [paths, unitPath] = await Promise.all([this.audienceUnitPaths(rows), this.viewerUnitPath(viewer)]);
    const member = { roleKeys: viewer.roleKeys, groupIds: viewer.groupIds, unitPath };
    return rows.filter((row) => isInAnnouncementAudience(audienceOf(row), member, paths));
  }

  /** §3.2: active announcements for the viewer that still need attention. */
  async active(viewer: AnnouncementViewer, now: Date = new Date()) {
    if (!(await this.isEnabled())) return { enabled: false, announcements: [] };
    const rows = (await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        startsAt: { lte: now },
        endsAt: { gt: now },
        acknowledgements: { none: { userId: viewer.userId } },
        dismissals: { none: { userId: viewer.userId } },
      },
      orderBy: [{ startsAt: 'desc' }],
      take: 50,
    })) as AnnouncementRow[];
    const visible = await this.filterForViewer(rows, viewer);
    const serviceNames = await this.serviceNames(visible.map((row) => row.serviceId));
    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    return {
      enabled: true,
      announcements: visible
        .sort((a, b) => rank[a.severity] - rank[b.severity] || b.startsAt.getTime() - a.startsAt.getTime())
        .map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          severity: row.severity,
          displayMode: row.displayMode,
          requiresAcknowledgement: row.requiresAcknowledgement,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          version: row.version,
          serviceName: row.serviceId === null ? null : (serviceNames.get(row.serviceId) ?? null),
        })),
    };
  }

  /** §3.2: the last 90 days of announcements the viewer was in the audience of. */
  async archive(viewer: AnnouncementViewer, now: Date = new Date()) {
    await this.requireEnabled();
    const rows = (await this.prisma.announcement.findMany({
      where: { status: 'PUBLISHED', startsAt: { lte: now }, endsAt: { gt: new Date(now.getTime() - announcementLimits.archiveDays * dayMs) } },
      orderBy: [{ startsAt: 'desc' }],
      take: announcementLimits.archiveMax,
    })) as AnnouncementRow[];
    const visible = await this.filterForViewer(rows, viewer);
    const acknowledgements = await this.prisma.announcementAcknowledgement.findMany({
      where: { userId: viewer.userId, announcementId: { in: visible.map((row) => row.id) } },
      select: { announcementId: true, acknowledgedAt: true },
    });
    const acknowledgedAt = new Map(acknowledgements.map((row) => [row.announcementId, row.acknowledgedAt]));
    const serviceNames = await this.serviceNames(visible.map((row) => row.serviceId));
    return {
      announcements: visible.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        severity: row.severity,
        requiresAcknowledgement: row.requiresAcknowledgement,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        isActive: row.endsAt.getTime() > now.getTime(),
        acknowledgedAt: acknowledgedAt.get(row.id)?.toISOString() ?? null,
        serviceName: row.serviceId === null ? null : (serviceNames.get(row.serviceId) ?? null),
      })),
    };
  }

  private async loadActiveForViewer(id: string, viewer: AnnouncementViewer, now: Date): Promise<AnnouncementRow> {
    await this.requireEnabled();
    const row = (await this.prisma.announcement.findUnique({ where: { id } })) as AnnouncementRow | null;
    if (row === null) throw new AnnouncementError(announcementErrorCodes.notFound);
    if (effectiveAnnouncementStatus(row, now) !== 'PUBLISHED') throw new AnnouncementError(announcementErrorCodes.notActive);
    const [visible] = await this.filterForViewer([row], viewer);
    if (visible === undefined) throw new AnnouncementError(announcementErrorCodes.notFound);
    return row;
  }

  /** "Pročitao/la sam" — idempotent. */
  async acknowledge(id: string, viewer: AnnouncementViewer, now: Date = new Date()): Promise<void> {
    const row = await this.loadActiveForViewer(id, viewer, now);
    if (!row.requiresAcknowledgement) throw new AnnouncementError(announcementErrorCodes.invalidState, 'acknowledgement');
    await this.prisma.announcementAcknowledgement.upsert({
      where: { announcementId_userId: { announcementId: id, userId: viewer.userId } },
      create: { announcementId: id, userId: viewer.userId, acknowledgedAt: now },
      update: {},
    });
  }

  /** "Zatvori" on a banner without acknowledgement — idempotent. */
  async dismiss(id: string, viewer: AnnouncementViewer, now: Date = new Date()): Promise<void> {
    const row = await this.loadActiveForViewer(id, viewer, now);
    if (row.requiresAcknowledgement) throw new AnnouncementError(announcementErrorCodes.invalidState, 'dismissal');
    await this.prisma.announcementDismissal.upsert({
      where: { announcementId_userId: { announcementId: id, userId: viewer.userId } },
      create: { announcementId: id, userId: viewer.userId, dismissedAt: now },
      update: {},
    });
  }

  // ------------------------------------------------------------ management

  /** Editor options: roles, units, groups and services (agents: own unit only). */
  async options(viewer: AnnouncementViewer) {
    const capabilities = await this.requireManage(viewer);
    const [units, groups, services, maxDurationDays, channels] = await Promise.all([
      this.loadUnits(),
      this.prisma.group.findMany({ select: { id: true, name: true, organizationalUnitId: true }, orderBy: { name: 'asc' } }),
      this.prisma.service.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.maxDurationDays(),
      this.channelAvailability(),
    ]);
    let visibleUnits = units;
    let visibleGroups = groups;
    if (capabilities.scopedToUnit) {
      const own = units.find((unit) => unit.id === viewer.homeOrganizationalUnitId);
      const inside = new Set(own === undefined ? [] : expandAudienceUnits([own.id], units));
      visibleUnits = units.filter((unit) => inside.has(unit.id));
      visibleGroups = groups.filter((group) => inside.has(group.organizationalUnitId));
    }
    return {
      ...capabilities,
      ...channels,
      maxDurationDays,
      organizationalUnits: visibleUnits
        .sort((a, b) => a.ouPath.localeCompare(b.ouPath))
        .map((unit) => ({ id: unit.id, name: unit.name, path: unit.ouPath })),
      groups: visibleGroups.map((group) => ({ id: group.id, name: group.name })),
      services,
    };
  }

  /** K2b: which extra channels the editor may offer right now. */
  async channelAvailability(): Promise<{ emailAvailable: boolean; teamsAvailable: boolean }> {
    const [channel, teamsEnabled] = await Promise.all([
      loadEmailChannelConfiguration(this.settings).catch(() => null),
      this.readSetting<unknown>(settingKeys.privateAnnouncementsTeamsEnabled, announcementDefaults.teamsEnabled),
    ]);
    const teamsUrl = teamsEnabled === true ? await resolveAnnouncementTeamsUrl(this.settings) : null;
    return {
      emailAvailable: channel !== null && channel.deliveryEnabled && channel.smtp !== null,
      teamsAvailable: teamsUrl !== null,
    };
  }

  private async maxDurationDays(): Promise<number> {
    const value = Number(await this.readSetting(settingKeys.privateAnnouncementsMaxDurationDays, announcementDefaults.maxDurationDays));
    return Number.isInteger(value) && value >= 1 ? value : announcementDefaults.maxDurationDays;
  }

  async list(viewer: AnnouncementViewer, now: Date = new Date()) {
    const capabilities = await this.requireManage(viewer);
    let rows = (await this.prisma.announcement.findMany({
      orderBy: [{ createdAt: 'desc' }],
      take: announcementLimits.manageListMax,
    })) as AnnouncementRow[];
    if (capabilities.scopedToUnit) {
      const units = await this.loadUnits();
      const paths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
      const ownPath = await this.unitPathOf(viewer.homeOrganizationalUnitId);
      rows = rows.filter((row) => isAudienceWithinUnit(row.audienceOrganizationalUnitIds, ownPath, paths));
    }
    const counts = await this.prisma.announcementAcknowledgement.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const acknowledged = new Map(counts.map((row) => [row.announcementId, row._count._all]));
    return {
      ...capabilities,
      announcements: rows.map((row) => ({
        ...this.toManaged(row, now),
        acknowledgedCount: (acknowledged.get(row.id) ?? 0) + row.anonymizedAcknowledgements,
      })),
    };
  }

  async detail(id: string, viewer: AnnouncementViewer, now: Date = new Date()) {
    const capabilities = await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, capabilities.scopedToUnit);
    const revisions = await this.prisma.announcementRevision.findMany({
      where: { announcementId: id },
      orderBy: { version: 'desc' },
      select: { version: true, title: true, body: true, createdAt: true },
    });
    return {
      ...this.toManaged(row, now),
      revisions: revisions.map((revision) => ({ ...revision, createdAt: revision.createdAt.toISOString() })),
    };
  }

  private toManaged(row: AnnouncementRow, now: Date) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      severity: row.severity,
      displayMode: row.displayMode,
      requiresAcknowledgement: row.requiresAcknowledgement,
      notifyAudience: row.notifyAudience,
      sendEmail: row.sendEmail,
      postToTeams: row.postToTeams,
      teamsPostedAt: row.teamsPostedAt?.toISOString() ?? null,
      teamsResult: row.teamsResult,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      roles: row.audienceRoles,
      organizationalUnitIds: row.audienceOrganizationalUnitIds,
      groupIds: row.audienceGroupIds,
      serviceId: row.serviceId,
      status: row.status,
      effectiveStatus: effectiveAnnouncementStatus(row, now),
      version: row.version,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
      audienceSizeAtPublish: row.audienceSizeAtPublish,
      lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Validates the editor input; returns the normalised write data. */
  private async validate(input: SaveAnnouncementInput, viewer: AnnouncementViewer, scopedToUnit: boolean, now: Date) {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 3 || title.length > announcementLimits.titleMax) throw new AnnouncementError(announcementErrorCodes.invalid, 'title');
    if (body.length < 1 || body.length > announcementLimits.bodyMax) throw new AnnouncementError(announcementErrorCodes.invalid, 'body');
    const startsAt = parseInstant(input.startsAt, 'startsAt');
    const endsAt = parseInstant(input.endsAt, 'endsAt');
    if (endsAt.getTime() <= startsAt.getTime()) throw new AnnouncementError(announcementErrorCodes.invalid, 'order');
    const maxDays = await this.maxDurationDays();
    if (endsAt.getTime() - startsAt.getTime() > maxDays * dayMs) {
      throw new AnnouncementError(announcementErrorCodes.invalid, `duration:${maxDays}`);
    }
    if (startsAt.getTime() > now.getTime() + announcementLimits.maxStartAheadDays * dayMs) {
      throw new AnnouncementError(announcementErrorCodes.invalid, 'startsAt');
    }
    if (input.displayMode === 'MODAL' && !input.requiresAcknowledgement) {
      throw new AnnouncementError(announcementErrorCodes.invalid, 'modal');
    }
    const roles = unique(input.roles);
    const organizationalUnitIds = unique(input.organizationalUnitIds);
    const groupIds = unique(input.groupIds);
    const [units, groupCount, service] = await Promise.all([
      this.loadUnits(),
      groupIds.length === 0 ? Promise.resolve(0) : this.prisma.group.count({ where: { id: { in: groupIds } } }),
      input.serviceId === undefined || input.serviceId === null || input.serviceId.trim().length === 0
        ? Promise.resolve(null)
        : this.prisma.service.findUnique({ where: { id: input.serviceId.trim() }, select: { id: true } }),
    ]);
    const paths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
    if (organizationalUnitIds.some((id) => !paths.has(id)) || groupCount !== groupIds.length) {
      throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'unknown');
    }
    if (input.serviceId !== undefined && input.serviceId !== null && input.serviceId.trim().length > 0 && service === null) {
      throw new AnnouncementError(announcementErrorCodes.invalid, 'serviceId');
    }
    if (scopedToUnit) {
      const ownPath = await this.unitPathOf(viewer.homeOrganizationalUnitId);
      if (!isAudienceWithinUnit(organizationalUnitIds, ownPath, paths)) {
        throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'ownUnit');
      }
    }
    // K2b: e-mail rides on the audience notification; Teams only when offered.
    const postToTeams = input.postToTeams === true && (await this.channelAvailability()).teamsAvailable;
    return {
      title,
      body,
      severity: input.severity,
      displayMode: input.displayMode,
      requiresAcknowledgement: input.requiresAcknowledgement,
      notifyAudience: input.notifyAudience,
      sendEmail: input.notifyAudience && input.sendEmail === true,
      postToTeams,
      startsAt,
      endsAt,
      audienceRoles: roles,
      audienceOrganizationalUnitIds: organizationalUnitIds,
      audienceGroupIds: groupIds,
      serviceId: service?.id ?? null,
    };
  }

  async create(input: SaveAnnouncementInput, viewer: AnnouncementViewer, now: Date = new Date()) {
    const capabilities = await this.requireManage(viewer);
    const data = await this.validate(input, viewer, capabilities.scopedToUnit, now);
    const row = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.announcement.create({ data: { ...data, createdById: viewer.userId } });
      await this.audit(transaction, auditLogActions.announcementCreated, created.id, viewer.userId, {
        title: data.title,
        severity: data.severity,
      });
      return created;
    });
    return this.detail(row.id, viewer, now);
  }

  /**
   * Drafts are edited freely. A published announcement keeps its audience
   * (the report counts against the audience captured at publication); text,
   * severity, display and end can change, and the previous text is kept.
   */
  async update(id: string, input: SaveAnnouncementInput, viewer: AnnouncementViewer, now: Date = new Date()) {
    const capabilities = await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, capabilities.scopedToUnit);
    if (row.status === 'WITHDRAWN' || effectiveAnnouncementStatus(row, now) === 'ENDED') {
      throw new AnnouncementError(announcementErrorCodes.invalidState, 'closed');
    }
    const data = await this.validate(input, viewer, capabilities.scopedToUnit, now);
    await this.prisma.$transaction(async (transaction) => {
      if (row.status === 'DRAFT') {
        await transaction.announcement.update({ where: { id }, data });
      } else {
        const audienceChanged =
          !sameSet(row.audienceRoles, data.audienceRoles) ||
          !sameSet(row.audienceOrganizationalUnitIds, data.audienceOrganizationalUnitIds) ||
          !sameSet(row.audienceGroupIds, data.audienceGroupIds);
        const startMovedAfterStart = row.startsAt.getTime() <= now.getTime() && row.startsAt.getTime() !== data.startsAt.getTime();
        if (audienceChanged || startMovedAfterStart) {
          throw new AnnouncementError(announcementErrorCodes.invalidState, 'publishedAudience');
        }
        if (row.requiresAcknowledgement !== data.requiresAcknowledgement) {
          throw new AnnouncementError(announcementErrorCodes.invalidState, 'publishedAcknowledgement');
        }
        const textChanged = row.title !== data.title || row.body !== data.body;
        if (textChanged) {
          await transaction.announcementRevision.create({
            data: { announcementId: id, version: row.version, title: row.title, body: row.body, editedById: viewer.userId },
          });
        }
        await transaction.announcement.update({
          where: { id },
          data: {
            title: data.title,
            body: data.body,
            severity: data.severity,
            displayMode: data.displayMode,
            notifyAudience: data.notifyAudience,
            sendEmail: data.sendEmail,
            // Already posted stays posted; before the post the choice can change.
            ...(row.teamsPostedAt === null ? { postToTeams: data.postToTeams } : {}),
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            serviceId: data.serviceId,
            ...(textChanged ? { version: row.version + 1 } : {}),
          },
        });
      }
      await this.audit(transaction, auditLogActions.announcementUpdated, id, viewer.userId, {
        status: row.status,
        version: row.version,
      });
    });
    return this.detail(id, viewer, now);
  }

  async publish(id: string, viewer: AnnouncementViewer, now: Date = new Date()) {
    const capabilities = await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, capabilities.scopedToUnit);
    if (row.status !== 'DRAFT') throw new AnnouncementError(announcementErrorCodes.invalidState, 'notDraft');
    if (row.endsAt.getTime() <= now.getTime()) throw new AnnouncementError(announcementErrorCodes.invalid, 'endsAt');
    const audienceSize = await this.countAudience(audienceOf(row));
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.announcement.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'PUBLISHED', publishedAt: now, publishedById: viewer.userId, audienceSizeAtPublish: audienceSize },
      });
      if (updated.count !== 1) throw new AnnouncementError(announcementErrorCodes.invalidState, 'notDraft');
      await this.audit(transaction, auditLogActions.announcementPublished, id, viewer.userId, {
        audienceSize,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      });
    });
    // Already started → notify right away; otherwise the sweep does it at startsAt.
    if (row.notifyAudience && row.startsAt.getTime() <= now.getTime()) {
      await this.notifyStarted(id, now).catch((error: unknown) =>
        this.logger.warn(`announcement_notify_failed id=${id} reason=${error instanceof Error ? error.message : String(error)}`),
      );
    }
    return this.detail(id, viewer, now);
  }

  async withdraw(id: string, reason: string, viewer: AnnouncementViewer, now: Date = new Date()) {
    const capabilities = await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, capabilities.scopedToUnit);
    if (row.status !== 'PUBLISHED') throw new AnnouncementError(announcementErrorCodes.invalidState, 'notPublished');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.announcement.update({ where: { id }, data: { status: 'WITHDRAWN', withdrawnAt: now } });
      await this.audit(transaction, auditLogActions.announcementWithdrawn, id, viewer.userId, { reason: reason.trim() });
    });
    return this.detail(id, viewer, now);
  }

  async remove(id: string, viewer: AnnouncementViewer): Promise<void> {
    const capabilities = await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, capabilities.scopedToUnit);
    if (row.status !== 'DRAFT') throw new AnnouncementError(announcementErrorCodes.invalidState, 'notDraft');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.announcement.delete({ where: { id } });
      await this.audit(transaction, auditLogActions.announcementDeleted, id, viewer.userId, { title: row.title });
    });
  }

  /** §3.3 "≈ 342 korisnika" before publication. */
  async previewAudience(audience: AnnouncementAudience, viewer: AnnouncementViewer): Promise<{ count: number }> {
    const capabilities = await this.requireManage(viewer);
    const normalized = {
      roles: unique(audience.roles),
      organizationalUnitIds: unique(audience.organizationalUnitIds),
      groupIds: unique(audience.groupIds),
    };
    if (capabilities.scopedToUnit) {
      const units = await this.loadUnits();
      const paths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
      const ownPath = await this.unitPathOf(viewer.homeOrganizationalUnitId);
      if (!isAudienceWithinUnit(normalized.organizationalUnitIds, ownPath, paths)) {
        throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'ownUnit');
      }
    }
    return { count: await this.countAudience(normalized) };
  }

  /** Prisma `where` for the active, non-anonymized members of an audience (also used by the worker). */
  async audienceWhereFor(audience: AnnouncementAudience) {
    return this.audienceWhere(audience);
  }

  private async audienceWhere(audience: AnnouncementAudience) {
    const unitIds =
      audience.organizationalUnitIds.length === 0 ? null : expandAudienceUnits(audience.organizationalUnitIds, await this.loadUnits());
    return {
      isActive: true,
      anonymizedAt: null,
      ...(audience.roles.length > 0 ? { userRoles: { some: { role: { key: { in: [...audience.roles] } } } } } : {}),
      ...(unitIds === null ? {} : { organizationalUnitId: { in: unitIds } }),
      ...(audience.groupIds.length > 0 ? { groupMembers: { some: { groupId: { in: [...audience.groupIds] } } } } : {}),
    };
  }

  private async countAudience(audience: AnnouncementAudience): Promise<number> {
    return this.prisma.user.count({ where: await this.audienceWhere(audience) });
  }

  // ------------------------------------------------------------ report

  private async requireReport(id: string, viewer: AnnouncementViewer): Promise<AnnouncementRow> {
    await this.requireEnabled();
    const capabilities = await this.capabilities(viewer);
    if (!capabilities.canReadReports) throw new AnnouncementError(announcementErrorCodes.forbidden);
    const row = await this.loadManaged(id, viewer, !viewer.canManageAll && !viewer.canReadReports);
    if (row.status === 'DRAFT') throw new AnnouncementError(announcementErrorCodes.invalidState, 'draft');
    return row;
  }

  /** Current audience members with their unit and acknowledgement (ordered by name). */
  private async reportRows(row: AnnouncementRow) {
    const [members, acknowledgements] = await Promise.all([
      this.prisma.user.findMany({
        where: await this.audienceWhere(audienceOf(row)),
        select: { id: true, displayName: true, email: true, organizationalUnit: { select: { name: true } } },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.announcementAcknowledgement.findMany({
        where: { announcementId: row.id },
        select: { userId: true, acknowledgedAt: true, user: { select: { organizationalUnit: { select: { name: true } } } } },
      }),
    ]);
    return { members, acknowledgements };
  }

  /**
   * §3.3: "X of Y" (Y captured at publication), per unit, and who has not
   * acknowledged yet (current audience minus acknowledgements).
   */
  async report(id: string, viewer: AnnouncementViewer) {
    const row = await this.requireReport(id, viewer);
    const { members, acknowledgements } = await this.reportRows(row);
    const acknowledged = new Map(acknowledgements.map((ack) => [ack.userId, ack.acknowledgedAt]));
    const byUnit = new Map<string, { unit: string; audience: number; acknowledged: number }>();
    for (const member of members) {
      const unit = member.organizationalUnit?.name ?? '';
      const entry = byUnit.get(unit) ?? { unit, audience: 0, acknowledged: 0 };
      entry.audience += 1;
      if (acknowledged.has(member.id)) entry.acknowledged += 1;
      byUnit.set(unit, entry);
    }
    const pending = members.filter((member) => !acknowledged.has(member.id));
    return {
      id: row.id,
      title: row.title,
      requiresAcknowledgement: row.requiresAcknowledgement,
      audienceSizeAtPublish: row.audienceSizeAtPublish ?? members.length,
      currentAudienceSize: members.length,
      acknowledgedCount: acknowledgements.length + row.anonymizedAcknowledgements,
      pendingCount: pending.length,
      lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
      canRemind: this.canRemind(row, new Date()),
      sendEmail: row.sendEmail,
      postToTeams: row.postToTeams,
      teamsPostedAt: row.teamsPostedAt?.toISOString() ?? null,
      teamsResult: row.teamsResult,
      emailRuns: (
        await this.prisma.announcementEmailRun.findMany({
          where: { announcementId: row.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { kind: true, sentCount: true, skippedCount: true, failedCount: true, endReason: true, createdAt: true, completedAt: true },
        })
      ).map((run) => ({ ...run, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null })),
      byUnit: [...byUnit.values()].sort((a, b) => a.unit.localeCompare(b.unit)),
      pending: pending.slice(0, announcementLimits.reportPendingListed).map((member) => ({
        id: member.id,
        displayName: member.displayName,
        unit: member.organizationalUnit?.name ?? '',
      })),
    };
  }

  async reportCsv(id: string, viewer: AnnouncementViewer): Promise<{ filename: string; content: string }> {
    const row = await this.requireReport(id, viewer);
    const { members, acknowledgements } = await this.reportRows(row);
    const acknowledged = new Map(acknowledgements.map((ack) => [ack.userId, ack.acknowledgedAt]));
    const lines = [
      ['name', 'email', 'unit', 'acknowledgedAt'].map(csvCell).join(','),
      ...members.map((member) =>
        [member.displayName, member.email, member.organizationalUnit?.name ?? '', acknowledged.get(member.id)?.toISOString() ?? '']
          .map(csvCell)
          .join(','),
      ),
    ];
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.announcementReportExported,
      entityType: auditLogEntityTypes.announcement,
      entityId: id,
      metadata: { rows: members.length },
      actorUserId: viewer.userId,
    });
    // BOM so spreadsheet programs read UTF-8 (č, ć, š, ž, đ).
    return { filename: `announcement-${id}.csv`, content: `\uFEFF${lines.join('\r\n')}\r\n` };
  }

  private canRemind(row: AnnouncementRow, now: Date): boolean {
    return (
      row.requiresAcknowledgement &&
      effectiveAnnouncementStatus(row, now) === 'PUBLISHED' &&
      (row.lastReminderAt === null || now.getTime() - row.lastReminderAt.getTime() >= announcementLimits.reminderIntervalMs)
    );
  }

  /** §3.3: one notification to everyone who has not acknowledged, at most once in 24 h. */
  async remind(id: string, viewer: AnnouncementViewer, now: Date = new Date()): Promise<{ notified: number; emailQueued: boolean }> {
    const row = await this.requireReport(id, viewer);
    if (!row.requiresAcknowledgement || effectiveAnnouncementStatus(row, now) !== 'PUBLISHED') {
      throw new AnnouncementError(announcementErrorCodes.notActive);
    }
    const since = new Date(now.getTime() - announcementLimits.reminderIntervalMs);
    const claimed = await this.prisma.announcement.updateMany({
      where: { id, OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: since } }] },
      data: { lastReminderAt: now },
    });
    if (claimed.count !== 1) throw new AnnouncementError(announcementErrorCodes.reminderTooSoon);
    const members = await this.prisma.user.findMany({
      where: { ...(await this.audienceWhere(audienceOf(row))), announcementAcknowledgements: { none: { announcementId: id } } },
      select: { id: true },
      take: announcementLimits.notifyMaxRecipients,
    });
    const notified = await this.fanOut(
      members.map((member) => member.id),
      notificationTypes.announcementReminder,
      row,
      `announcement-reminder:${id}:${now.toISOString().slice(0, 10)}`,
    );
    const emailQueued = row.sendEmail ? await this.queueEmailRun(id, 'REMINDER') : false;
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action: auditLogActions.announcementReminded,
      entityType: auditLogEntityTypes.announcement,
      entityId: id,
      metadata: { notified, emailQueued },
      actorUserId: viewer.userId,
    });
    return { notified, emailQueued };
  }

  // ------------------------------------------------------------ sweep

  /** In-app notification to the audience once the announcement has started (idempotent). */
  async notifyStarted(id: string, now: Date = new Date()): Promise<number> {
    const claimed = await this.prisma.announcement.updateMany({
      where: { id, status: 'PUBLISHED', notifyAudience: true, audienceNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      data: { audienceNotifiedAt: now },
    });
    if (claimed.count !== 1) return 0;
    const row = (await this.prisma.announcement.findUnique({ where: { id } })) as AnnouncementRow | null;
    if (row === null) return 0;
    if (row.sendEmail) await this.queueEmailRun(id, 'PUBLISHED');
    const members = await this.prisma.user.findMany({
      where: await this.audienceWhere(audienceOf(row)),
      select: { id: true },
      take: announcementLimits.notifyMaxRecipients,
    });
    return this.fanOut(
      members.map((member) => member.id),
      notificationTypes.announcementPublished,
      row,
      `announcement-published:${id}`,
    );
  }

  /** Worker: notifications for announcements that started, and receipt retention. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (!(await this.isEnabled())) return 0;
    const due = await this.prisma.announcement.findMany({
      where: { status: 'PUBLISHED', notifyAudience: true, audienceNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
      take: 20,
    });
    let sent = 0;
    for (const { id } of due) {
      try {
        sent += await this.notifyStarted(id, now);
      } catch (error) {
        this.logger.warn(`announcement_notify_failed id=${id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await this.applyRetention(now);
    return sent;
  }

  /** §7: acknowledgements and dismissals go N days after the end (legal hold keeps them). */
  private async applyRetention(now: Date): Promise<void> {
    const days = Number(
      await this.readSetting(settingKeys.privateAnnouncementsReceiptRetentionDays, announcementDefaults.receiptRetentionDays),
    );
    if (!Number.isFinite(days) || days <= 0) return;
    const cutoff = new Date(now.getTime() - days * dayMs);
    const where = { announcement: { endsAt: { lt: cutoff } }, user: { legalHoldAt: null } };
    try {
      await this.prisma.announcementAcknowledgement.deleteMany({ where });
      await this.prisma.announcementDismissal.deleteMany({ where });
    } catch (error) {
      this.logger.warn(`announcement retention failed: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }

  // ------------------------------------------------------------ helpers

  /** K2b: the worker mails the audience in batches (see AnnouncementDeliveryService). */
  private async queueEmailRun(announcementId: string, kind: 'PUBLISHED' | 'REMINDER'): Promise<boolean> {
    try {
      await this.prisma.announcementEmailRun.create({ data: { announcementId, kind } });
      return true;
    } catch (error) {
      this.logger.warn(`announcement_email_queue_failed id=${announcementId} reason=${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async fanOut(userIds: readonly string[], type: NotificationType, row: AnnouncementRow, dedupePrefix: string): Promise<number> {
    if (userIds.length === 0) return 0;
    const policy = await loadNotificationPreferencePolicy(this.settings);
    let sent = 0;
    for (const userId of userIds) {
      try {
        const created = await persistInAppNotification(
          this.prisma,
          {
            userId,
            type,
            title: notificationTitleKeys[type],
            // The announcement title is the author's text; it is shown as written.
            body: row.title,
            ticketId: null,
            payload: {
              ticketId: '',
              ticketNumber: '',
              event: type,
              messageId: dedupePrefix,
              actorUserId: null,
              confidential: false,
              announcementId: row.id,
              severity: row.severity,
            } as never,
            dedupeKey: `${dedupePrefix}:${userId}`,
          },
          policy,
        );
        if (created !== null) sent += 1;
      } catch (error) {
        this.logger.warn(`announcement_notify_user_failed id=${row.id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return sent;
  }

  private async serviceNames(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const wanted = unique(ids.filter((id): id is string => id !== null));
    if (wanted.length === 0) return new Map();
    const services = await this.prisma.service.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } });
    return new Map(services.map((service) => [service.id, service.name]));
  }

  private async audit(
    client: unknown,
    action: string,
    announcementId: string,
    actorUserId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await appendAuditLog(client as AuditLogWriteClient, {
      action,
      entityType: auditLogEntityTypes.announcement,
      entityId: announcementId,
      metadata: metadata as JsonValue,
      actorUserId,
    });
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}
