import { Injectable, Logger, Optional } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { appendAuditLog } from '../audit-log/append-audit-log';
import type { AuditLogTransactionalClient, AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import type { JsonValue } from '../change-log/change-log.types';
import { AuthorizationService } from '../authorization/authorization.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { doesOrganizationalUnitScopeCover } from '../authorization/does-organizational-unit-scope-cover';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { notificationTitleKeys, notificationTypes, type NotificationType } from '../notifications/notifications.constants';
import { loadNotificationPreferencePolicy } from '../notifications/preferences/notification-preference-policy';
import { resolveDeliveryDecisions } from '../notifications/preferences/resolve-delivery-decisions';
import { announcementDefaults } from '../settings/definitions/announcement-settings';
import { settingKeys } from '../settings/setting-keys';
import { resolveAnnouncementTeamsUrl } from './announcement-teams-url';
import { SettingsService } from '../settings/settings.service';
import {
  csvCell,
  effectiveAnnouncementStatus,
  expandAudienceUnits,
  isInAnnouncementAudience,
  organizationalUnitAncestorPaths,
  type AnnouncementAudience,
} from './announcement-audience';
import { decodeAnnouncementReportCursor, encodeAnnouncementReportCursor } from './announcement-report-cursor';
import { authorizeAnnouncementAudiences, type AnnouncementAudienceAuthorizationCandidate } from './announcement-resource-authorization';
import { announcementUnitPathCoveredByScope, hasAnnouncementPermissionScope } from './announcement-permission-scope';
import type { AnnouncementViewer } from './announcement-viewer';
import { AnnouncementError, announcementErrorCodes, announcementLimits } from './announcements.constants';
import { TicketRealtimeHub } from '../tickets/ticket-realtime.hub';

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

type ReportCsvMember = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly organizationalUnit: { readonly name: string } | null;
  readonly announcementAcknowledgements: readonly { readonly acknowledgedAt: Date }[];
};

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
    private readonly authorization: AuthorizationService,
    // BA-announcements-20: optional so existing unit constructions keep working;
    // both runtime modules provide the shared hub.
    @Optional() private readonly realtimeHub?: TicketRealtimeHub,
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

  private async agentManagementUnitPath(viewer: AnnouncementViewer): Promise<string | null> {
    if (!viewer.isAgent || viewer.homeOrganizationalUnitId === null) return null;
    const enabled = await this.readSetting<unknown>(
      settingKeys.privateAnnouncementsAgentsMayPublish,
      announcementDefaults.agentsMayPublish,
    );
    return enabled === true ? this.unitPathOf(viewer.homeOrganizationalUnitId) : null;
  }

  /** What the viewer may do in the management screen; resource access is checked again per audience. */
  async capabilities(viewer: AnnouncementViewer): Promise<{ canManage: boolean; scopedToUnit: boolean; canReadReports: boolean }> {
    const agentPath = await this.agentManagementUnitPath(viewer);
    const agentMayPublish = agentPath !== null;
    const hasManageScope = hasAnnouncementPermissionScope(viewer.manageScope);
    const hasReportScope = hasAnnouncementPermissionScope(viewer.reportScope);
    return {
      canManage: hasManageScope || agentMayPublish,
      scopedToUnit:
        !viewer.manageScope.global &&
        (viewer.manageScope.organizationalUnits.length > 0 || agentMayPublish),
      canReadReports: hasReportScope || agentMayPublish,
    };
  }

  private async requireManage(viewer: AnnouncementViewer) {
    await this.requireEnabled();
    const capabilities = await this.capabilities(viewer);
    if (!capabilities.canManage) throw new AnnouncementError(announcementErrorCodes.forbidden);
    return capabilities;
  }

  private async unitPathsForAudience(organizationalUnitIds: readonly string[]): Promise<Map<string, string>> {
    const ids = unique(organizationalUnitIds);
    if (ids.length === 0) return new Map();
    const units = await this.prisma.organizationalUnit.findMany({
      where: { id: { in: ids } },
      select: { id: true, ouPath: true },
    });
    return new Map(units.map((unit) => [unit.id, unit.ouPath]));
  }

  private async authorizedAudienceKeys(
    viewer: AnnouncementViewer,
    permissionKey: string,
    candidates: readonly AnnouncementAudienceAuthorizationCandidate[],
    allowAgentScope: boolean,
  ): Promise<ReadonlySet<string>> {
    const organizationalUnitIds = unique(candidates.flatMap((candidate) => [...candidate.organizationalUnitIds]));
    const [unitPaths, agentPath] = await Promise.all([
      this.unitPathsForAudience(organizationalUnitIds),
      allowAgentScope ? this.agentManagementUnitPath(viewer) : Promise.resolve(null),
    ] as const);
    const permissionScope = permissionKey === permissionKeys.announcementManage ? viewer.manageScope : viewer.reportScope;
    return authorizeAnnouncementAudiences({
      authorization: this.authorization,
      principal: viewer.authorizationPrincipal,
      permissionKey,
      permissionScope,
      candidates,
      unitPaths,
      fallbackOrganizationalUnitPaths: agentPath === null ? [] : [agentPath],
    });
  }

  /**
   * BA-announcements-05: audience OU checks alone do not bind group/service
   * references. A scoped manager/agent may reference only groups whose OU
   * sits inside their own subtree; a service has no OU anchor, so a scoped
   * actor may not reference one at all (fail-closed, as in BA-01).
   */
  private async assertManageReferences(
    viewer: AnnouncementViewer,
    groupIds: readonly string[],
    serviceId: string | null,
  ): Promise<void> {
    if (viewer.manageScope.global) return;
    if (serviceId !== null) throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'service');
    if (groupIds.length === 0) return;
    const [groups, units, agentPath] = await Promise.all([
      this.prisma.group.findMany({
        where: { id: { in: [...groupIds] } },
        select: { id: true, organizationalUnitId: true },
      }),
      this.loadUnits(),
      this.agentManagementUnitPath(viewer),
    ]);
    const paths = new Map(units.map((unit) => [unit.id, unit.ouPath]));
    for (const group of groups) {
      const path = paths.get(group.organizationalUnitId) ?? null;
      const covered =
        announcementUnitPathCoveredByScope(path, viewer.manageScope) ||
        (agentPath !== null &&
          path !== null &&
          doesOrganizationalUnitScopeCover({ assignedPath: agentPath, requestedPath: path }));
      if (!covered) throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'group');
    }
  }

  private async assertManageAudience(viewer: AnnouncementViewer, organizationalUnitIds: readonly string[]): Promise<void> {
    const key = 'announcement-input';
    const allowed = await this.authorizedAudienceKeys(
      viewer,
      permissionKeys.announcementManage,
      [{ key, organizationalUnitIds }],
      true,
    );
    if (!allowed.has(key)) throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'scope');
  }

  /** Loads an announcement only when the permission covers every audience OU. */
  private async loadManaged(
    id: string,
    viewer: AnnouncementViewer,
    permissionKey: string,
    allowAgentScope = false,
  ): Promise<AnnouncementRow> {
    const row = (await this.prisma.announcement.findUnique({ where: { id } })) as AnnouncementRow | null;
    if (row === null) throw new AnnouncementError(announcementErrorCodes.notFound);
    const allowed = await this.authorizedAudienceKeys(
      viewer,
      permissionKey,
      [{ key: id, organizationalUnitIds: row.audienceOrganizationalUnitIds }],
      allowAgentScope,
    );
    if (!allowed.has(id)) throw new AnnouncementError(announcementErrorCodes.notFound);
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

  /**
   * Pushes the same AND audience semantics used by `isInAnnouncementAudience`
   * into PostgreSQL, before the active/archive result cap is applied.
   */
  private async audienceWhereForViewer(viewer: AnnouncementViewer): Promise<Prisma.AnnouncementWhereInput> {
    const unitPath = await this.viewerUnitPath(viewer);
    const ancestorPaths = organizationalUnitAncestorPaths(unitPath);
    const units = ancestorPaths.length === 0
      ? []
      : await this.prisma.organizationalUnit.findMany({
          where: { ouPath: { in: ancestorPaths } },
          select: { id: true },
        });
    const audienceUnitIds = units.map((unit) => unit.id);
    const roleKeys = [...new Set(viewer.roleKeys)];
    const groupIds = [...new Set(viewer.groupIds)];

    const roleFilters: Prisma.AnnouncementWhereInput[] = [{ audienceRoles: { isEmpty: true } }];
    if (roleKeys.length > 0) roleFilters.push({ audienceRoles: { hasSome: roleKeys } });
    const organizationalUnitFilters: Prisma.AnnouncementWhereInput[] = [{ audienceOrganizationalUnitIds: { isEmpty: true } }];
    if (audienceUnitIds.length > 0) {
      organizationalUnitFilters.push({ audienceOrganizationalUnitIds: { hasSome: audienceUnitIds } });
    }
    const groupFilters: Prisma.AnnouncementWhereInput[] = [{ audienceGroupIds: { isEmpty: true } }];
    if (groupIds.length > 0) groupFilters.push({ audienceGroupIds: { hasSome: groupIds } });

    return {
      AND: [
        { OR: roleFilters },
        { OR: organizationalUnitFilters },
        { OR: groupFilters },
      ],
    };
  }

  /** §3.2: active announcements for the viewer that still need attention. */
  async active(viewer: AnnouncementViewer, now: Date = new Date()) {
    if (!(await this.isEnabled())) return { enabled: false, announcements: [] };
    const audienceWhere = await this.audienceWhereForViewer(viewer);
    const rows = (await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        startsAt: { lte: now },
        endsAt: { gt: now },
        acknowledgements: { none: { userId: viewer.userId } },
        dismissals: { none: { userId: viewer.userId } },
        ...audienceWhere,
      },
      orderBy: [{ severity: 'desc' }, { startsAt: 'desc' }, { id: 'asc' }],
      take: announcementLimits.activeMax,
    })) as AnnouncementRow[];
    const serviceNames = await this.serviceNames(rows.map((row) => row.serviceId));
    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    return {
      enabled: true,
      announcements: rows
        .sort((a, b) => rank[a.severity] - rank[b.severity] || b.startsAt.getTime() - a.startsAt.getTime() || a.id.localeCompare(b.id))
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
    const audienceWhere = await this.audienceWhereForViewer(viewer);
    const rows = (await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        startsAt: { lte: now },
        endsAt: { gt: new Date(now.getTime() - announcementLimits.archiveDays * dayMs) },
        ...audienceWhere,
      },
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      // BA-announcements-18: fetch one extra row so a capped archive is an
      // explicit `hasMore` signal instead of a silently incomplete list
      // (same disclosure pattern as the BA-14 manage list).
      take: announcementLimits.archiveMax + 1,
    })) as AnnouncementRow[];
    const hasMore = rows.length > announcementLimits.archiveMax;
    const visible = hasMore ? rows.slice(0, announcementLimits.archiveMax) : rows;
    const acknowledgements = await this.prisma.announcementAcknowledgement.findMany({
      where: { userId: viewer.userId, announcementId: { in: visible.map((row) => row.id) } },
      select: { announcementId: true, acknowledgedAt: true },
    });
    const acknowledgedAt = new Map(acknowledgements.map((row) => [row.announcementId, row.acknowledgedAt]));
    const serviceNames = await this.serviceNames(visible.map((row) => row.serviceId));
    return {
      hasMore,
      listLimit: announcementLimits.archiveMax,
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
      const agentPath = await this.agentManagementUnitPath(viewer);
      const inside = new Set(
        units
          .filter((unit) =>
            announcementUnitPathCoveredByScope(unit.ouPath, viewer.manageScope) ||
            (agentPath !== null && doesOrganizationalUnitScopeCover({ assignedPath: agentPath, requestedPath: unit.ouPath })),
          )
          .map((unit) => unit.id),
      );
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
      // BA-announcements-05: scoped actors cannot reference services at all,
      // so the editor does not offer them any.
      services: viewer.manageScope.global ? services : [],
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
    // BA-announcements-14: page candidates (newest first, id tie-break) and apply
    // the scope filter per page until the caller's own quota is full, instead of
    // capping the GLOBAL list first — a scoped manager whose announcements sit
    // behind more than `manageListMax` foreign ones previously never saw them.
    // The scan is bounded by `manageListScanMax`; when it stops early the result
    // is flagged `truncated` rather than silently incomplete.
    const rows: AnnouncementRow[] = [];
    let scanned = 0;
    let truncated = false;
    let cursor: { readonly createdAt: Date; readonly id: string } | null = null;
    for (;;) {
      const page = (await this.prisma.announcement.findMany({
        ...(cursor === null
          ? {}
          : {
              where: {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
                ],
              },
            }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: announcementLimits.manageListMax,
      })) as AnnouncementRow[];
      if (page.length === 0) break;
      scanned += page.length;
      const allowed = await this.authorizedAudienceKeys(
        viewer,
        permissionKeys.announcementManage,
        page.map((row) => ({ key: row.id, organizationalUnitIds: row.audienceOrganizationalUnitIds })),
        true,
      );
      for (const row of page) {
        if (allowed.has(row.id) && rows.length < announcementLimits.manageListMax) rows.push(row);
      }
      const last = page.at(-1);
      if (last !== undefined) cursor = { createdAt: last.createdAt, id: last.id };
      const quotaFull = rows.length >= announcementLimits.manageListMax;
      const reachedEnd = page.length < announcementLimits.manageListMax;
      if (reachedEnd) break;
      if (quotaFull || scanned >= announcementLimits.manageListScanMax) {
        // More candidates exist beyond the examined window (a full display
        // quota, or the bounded scan gave up) — say so instead of silently
        // returning an incomplete list.
        truncated = true;
        break;
      }
    }
    const counts = await this.prisma.announcementAcknowledgement.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const acknowledged = new Map(counts.map((row) => [row.announcementId, row._count._all]));
    return {
      ...capabilities,
      truncated,
      listLimit: announcementLimits.manageListMax,
      announcements: rows.map((row) => ({
        ...this.toManaged(row, now),
        acknowledgedCount: (acknowledged.get(row.id) ?? 0) + row.anonymizedAcknowledgements,
      })),
    };
  }

  async detail(id: string, viewer: AnnouncementViewer, now: Date = new Date()) {
    await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, permissionKeys.announcementManage, true);
    const revisions = await this.prisma.announcementRevision.findMany({
      where: { announcementId: id },
      orderBy: { version: 'desc' },
      select: {
        version: true,
        title: true,
        body: true,
        severity: true,
        displayMode: true,
        startsAt: true,
        endsAt: true,
        serviceId: true,
        notifyAudience: true,
        sendEmail: true,
        postToTeams: true,
        createdAt: true,
      },
    });
    return {
      ...this.toManaged(row, now),
      revisions: revisions.map((revision) => ({
        ...revision,
        startsAt: revision.startsAt?.toISOString() ?? null,
        endsAt: revision.endsAt?.toISOString() ?? null,
        createdAt: revision.createdAt.toISOString(),
      })),
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
  private async validate(input: SaveAnnouncementInput, now: Date) {
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
    await this.requireManage(viewer);
    const data = await this.validate(input, now);
    await this.assertManageAudience(viewer, data.audienceOrganizationalUnitIds);
    await this.assertManageReferences(viewer, data.audienceGroupIds, data.serviceId);
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
  async update(
    id: string,
    input: SaveAnnouncementInput,
    viewer: AnnouncementViewer,
    expectedVersion: number,
    now: Date = new Date(),
  ) {
    await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, permissionKeys.announcementManage, true);
    if (row.status === 'WITHDRAWN' || effectiveAnnouncementStatus(row, now) === 'ENDED') {
      throw new AnnouncementError(announcementErrorCodes.invalidState, 'closed');
    }
    const data = await this.validate(input, now);
    await this.assertManageAudience(viewer, data.audienceOrganizationalUnitIds);
    await this.assertManageReferences(viewer, data.audienceGroupIds, data.serviceId);
    await this.prisma.$transaction(async (transaction) => {
      if (row.status === 'DRAFT') {
        const updated = await transaction.announcement.updateMany({
          where: { id, version: expectedVersion },
          data: { ...data, version: expectedVersion + 1 },
        });
        if (updated.count !== 1) throw new AnnouncementError(announcementErrorCodes.versionConflict);
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
        // BA-announcements-07: any change to the published presentation leaves
        // a full immutable snapshot of the state being replaced, not only a
        // title/body copy for text edits.
        const snapshotChanged =
          textChanged ||
          row.severity !== data.severity ||
          row.displayMode !== data.displayMode ||
          row.startsAt.getTime() !== data.startsAt.getTime() ||
          row.endsAt.getTime() !== data.endsAt.getTime() ||
          row.serviceId !== data.serviceId ||
          row.notifyAudience !== data.notifyAudience ||
          row.sendEmail !== data.sendEmail ||
          row.postToTeams !== data.postToTeams;
        if (snapshotChanged) {
          await transaction.announcementRevision.create({
            data: {
              announcementId: id,
              version: row.version,
              title: row.title,
              body: row.body,
              severity: row.severity,
              displayMode: row.displayMode,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              serviceId: row.serviceId,
              notifyAudience: row.notifyAudience,
              sendEmail: row.sendEmail,
              postToTeams: row.postToTeams,
              editedById: viewer.userId,
            },
          });
        }
        const updated = await transaction.announcement.updateMany({
          where: { id, version: expectedVersion },
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
            version: expectedVersion + 1,
          },
        });
        if (updated.count !== 1) throw new AnnouncementError(announcementErrorCodes.versionConflict);
      }
      await this.audit(transaction, auditLogActions.announcementUpdated, id, viewer.userId, {
        status: row.status,
        version: row.version,
      });
    });
    return this.detail(id, viewer, now);
  }

  async publish(id: string, viewer: AnnouncementViewer, expectedVersion: number, now: Date = new Date()) {
    await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, permissionKeys.announcementManage, true);
    if (row.status !== 'DRAFT') throw new AnnouncementError(announcementErrorCodes.invalidState, 'notDraft');
    if (row.endsAt.getTime() <= now.getTime()) throw new AnnouncementError(announcementErrorCodes.invalid, 'endsAt');
    const audienceWhere = await this.audienceWhere(audienceOf(row));
    let audienceSize = 0;
    await this.prisma.$transaction(async (transaction) => {
      // BA-announcements-13: the status flip, the audience size and the immutable
      // membership snapshot are ONE transaction, so the report always counts
      // against exactly the audience captured here. Members are written in
      // user-id keyset pages to keep every statement bounded.
      const updated = await transaction.announcement.updateMany({
        where: { id, status: 'DRAFT', version: expectedVersion },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          publishedById: viewer.userId,
          version: expectedVersion + 1,
        },
      });
      if (updated.count !== 1) throw new AnnouncementError(announcementErrorCodes.versionConflict);
      let afterUserId: string | null = null;
      for (;;) {
        const members: Array<{ readonly id: string; readonly organizationalUnitId: string | null }> =
          await transaction.user.findMany({
          where: afterUserId === null ? audienceWhere : { AND: [audienceWhere, { id: { gt: afterUserId } }] },
          select: { id: true, organizationalUnitId: true },
          orderBy: { id: 'asc' },
          take: announcementLimits.notifyBatchSize,
        });
        if (members.length === 0) break;
        await transaction.announcementAudienceMember.createMany({
          data: members.map((member) => ({
            announcementId: id,
            userId: member.id,
            organizationalUnitId: member.organizationalUnitId,
          })),
          skipDuplicates: true,
        });
        audienceSize += members.length;
        afterUserId = members.at(-1)?.id ?? null;
        if (members.length < announcementLimits.notifyBatchSize) break;
      }
      await transaction.announcement.update({
        where: { id },
        data: { audienceSizeAtPublish: audienceSize },
      });
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

  async withdraw(id: string, reason: string, viewer: AnnouncementViewer, expectedVersion: number, now: Date = new Date()) {
    await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, permissionKeys.announcementManage, true);
    if (row.status !== 'PUBLISHED') throw new AnnouncementError(announcementErrorCodes.invalidState, 'notPublished');
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.announcement.updateMany({
        where: { id, status: 'PUBLISHED', version: expectedVersion },
        data: { status: 'WITHDRAWN', withdrawnAt: now, version: expectedVersion + 1 },
      });
      if (updated.count !== 1) throw new AnnouncementError(announcementErrorCodes.versionConflict);
      await this.audit(transaction, auditLogActions.announcementWithdrawn, id, viewer.userId, { reason: reason.trim() });
    });
    return this.detail(id, viewer, now);
  }

  async remove(id: string, viewer: AnnouncementViewer, expectedVersion: number): Promise<void> {
    await this.requireManage(viewer);
    const row = await this.loadManaged(id, viewer, permissionKeys.announcementManage, true);
    if (row.status !== 'DRAFT') throw new AnnouncementError(announcementErrorCodes.invalidState, 'notDraft');
    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.announcement.deleteMany({
        where: { id, status: 'DRAFT', version: expectedVersion },
      });
      if (deleted.count !== 1) throw new AnnouncementError(announcementErrorCodes.versionConflict);
      await this.audit(transaction, auditLogActions.announcementDeleted, id, viewer.userId, { title: row.title });
    });
  }

  /** §3.3 "≈ 342 korisnika" before publication. */
  async previewAudience(audience: AnnouncementAudience, viewer: AnnouncementViewer): Promise<{ count: number }> {
    await this.requireManage(viewer);
    const normalized = {
      roles: unique(audience.roles),
      organizationalUnitIds: unique(audience.organizationalUnitIds),
      groupIds: unique(audience.groupIds),
    };
    await this.assertManageAudience(viewer, normalized.organizationalUnitIds);
    // BA-announcements-16: unknown OU/group ids used to be dropped silently, so
    // a typo produced a plausible-looking (often zero) count for every manager,
    // global ones included. Reject unknown references like create-time
    // reference validation does (BA-announcements-05).
    if (normalized.organizationalUnitIds.length > 0) {
      const units = await this.loadUnits();
      const knownUnitIds = new Set(units.map((unit) => unit.id));
      if (normalized.organizationalUnitIds.some((unitId) => !knownUnitIds.has(unitId))) {
        throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'organizationalUnit');
      }
    }
    if (normalized.groupIds.length > 0) {
      const knownGroups = await this.prisma.group.count({
        where: { id: { in: normalized.groupIds } },
      });
      if (knownGroups !== normalized.groupIds.length) {
        throw new AnnouncementError(announcementErrorCodes.invalidAudience, 'group');
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
    const row = await this.loadManaged(id, viewer, permissionKeys.announcementReportRead, true);
    if (row.status === 'DRAFT') throw new AnnouncementError(announcementErrorCodes.invalidState, 'draft');
    return row;
  }

  private pendingReportWhere(
    row: AnnouncementRow,
    audienceWhere: Prisma.UserWhereInput,
    afterUserId: string | null,
  ): Prisma.UserWhereInput {
    const terms: Prisma.UserWhereInput[] = [
      audienceWhere,
      { announcementAcknowledgements: { none: { announcementId: row.id } } },
    ];
    if (afterUserId !== null) terms.push({ id: { gt: afterUserId } });
    return { AND: terms };
  }

  private async reportPendingRows(
    row: AnnouncementRow,
    audienceWhere: Prisma.UserWhereInput,
    afterUserId: string | null,
  ) {
    const limit = announcementLimits.reportPendingListed;
    const members = await this.prisma.user.findMany({
      where: this.pendingReportWhere(row, audienceWhere, afterUserId),
      select: { id: true, displayName: true, organizationalUnit: { select: { name: true } } },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = members.length > limit;
    const listed = members.slice(0, limit);
    const lastListed = listed.at(-1);
    return {
      pending: listed.map((member) => ({
        id: member.id,
        displayName: member.displayName,
        unit: member.organizationalUnit?.name ?? '',
      })),
      pendingNextCursor:
        hasMore && lastListed !== undefined ? encodeAnnouncementReportCursor(row.id, lastListed.id) : null,
    };
  }

  /**
   * §3.3: DB aggregates keep the audience and acknowledgement summary bounded;
   * pending identities are fetched separately in a fixed-size keyset page.
   */
  async report(id: string, viewer: AnnouncementViewer) {
    const row = await this.requireReport(id, viewer);
    const audienceWhere = await this.audienceWhere(audienceOf(row));
    const acknowledgedAudienceWhere: Prisma.UserWhereInput = {
      AND: [audienceWhere, { announcementAcknowledgements: { some: { announcementId: row.id } } }],
    };
    const pendingWhere = this.pendingReportWhere(row, audienceWhere, null);
    // BA-announcements-13: resolve the publish snapshot first; when it exists the
    // live pending page is never fetched (the snapshot page replaces it below).
    const snapshot = await this.snapshotReport(row);
    const [audienceByUnit, acknowledgedByUnit, acknowledgementCount, pendingCount, pendingPage, emailRuns] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['organizationalUnitId'],
        where: audienceWhere,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['organizationalUnitId'],
        where: acknowledgedAudienceWhere,
        _count: { _all: true },
      }),
      this.prisma.announcementAcknowledgement.count({ where: { announcementId: row.id } }),
      this.prisma.user.count({ where: pendingWhere }),
      snapshot === null
        ? this.reportPendingRows(row, audienceWhere, null)
        : Promise.resolve({ pending: [], pendingNextCursor: null }),
      this.prisma.announcementEmailRun.findMany({
        where: { announcementId: row.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { kind: true, sentCount: true, skippedCount: true, failedCount: true, endReason: true, createdAt: true, completedAt: true },
      }),
    ]);
    const currentAudienceSize = audienceByUnit.reduce((total, group) => total + group._count._all, 0);
    // BA-announcements-12: acknowledgement figures are reported per population,
    // never mixed. `acknowledgedInCurrentAudience` + `pendingCount` partition the
    // CURRENT audience; `acknowledgedCount` stays the all-time total (including
    // users who since left the audience and anonymized receipts), so no ratio in
    // the UI ever divides one population by another population's size.
    const acknowledgedInCurrentAudience = acknowledgedByUnit.reduce(
      (total, group) => total + group._count._all, 0,
    );
    const acknowledgedTotal = acknowledgementCount + row.anonymizedAcknowledgements;
    const acknowledgedOutsideCurrentAudience = acknowledgedTotal - acknowledgedInCurrentAudience;
    const unitIds = [
      ...new Set(
        [...audienceByUnit, ...acknowledgedByUnit]
          .map((group) => group.organizationalUnitId)
          .filter((unitId): unitId is string => unitId !== null),
      ),
    ];
    const unitRows =
      unitIds.length === 0
        ? []
        : await this.prisma.organizationalUnit.findMany({
            where: { id: { in: unitIds } },
            select: { id: true, name: true },
          });
    const unitNames = new Map(unitRows.map((unit) => [unit.id, unit.name]));
    const byUnit = new Map<string, { unit: string; audience: number; acknowledged: number }>();
    for (const group of audienceByUnit) {
      const unit = group.organizationalUnitId === null ? '' : (unitNames.get(group.organizationalUnitId) ?? '');
      const entry = byUnit.get(unit) ?? { unit, audience: 0, acknowledged: 0 };
      entry.audience += group._count._all;
      byUnit.set(unit, entry);
    }
    for (const group of acknowledgedByUnit) {
      const unit = group.organizationalUnitId === null ? '' : (unitNames.get(group.organizationalUnitId) ?? '');
      const entry = byUnit.get(unit) ?? { unit, audience: 0, acknowledged: 0 };
      entry.acknowledged += group._count._all;
      byUnit.set(unit, entry);
    }
    // BA-announcements-13: the snapshot was resolved above, before the aggregates.
    if (snapshot !== null) {
      const missingUnitIds = snapshot.byUnit
        .map((entry) => entry.organizationalUnitId)
        .filter((unitId): unitId is string => unitId !== null && !unitNames.has(unitId));
      if (missingUnitIds.length > 0) {
        const extraUnits = await this.prisma.organizationalUnit.findMany({
          where: { id: { in: missingUnitIds } },
          select: { id: true, name: true },
        });
        for (const unit of extraUnits) unitNames.set(unit.id, unit.name);
      }
    }
    const headlineByUnit = snapshot?.byUnit.map((entry) => ({
      unit: entry.organizationalUnitId === null ? '' : (unitNames.get(entry.organizationalUnitId) ?? ''),
      audience: entry.audience,
      acknowledged: entry.acknowledged,
    }));
    const headlinePending = snapshot === null ? pendingPage : await this.snapshotPendingRows(row, snapshot.acknowledgedUserIds, null);
    return {
      id: row.id,
      title: row.title,
      requiresAcknowledgement: row.requiresAcknowledgement,
      audienceSizeAtPublish: row.audienceSizeAtPublish ?? currentAudienceSize,
      currentAudienceSize,
      acknowledgedCount: acknowledgedTotal,
      acknowledgedInCurrentAudience,
      acknowledgedOutsideCurrentAudience,
      // BA-announcements-13: snapshot basis when captured at publication.
      snapshotAvailable: snapshot !== null,
      acknowledgedInSnapshotAudience: snapshot?.acknowledged ?? null,
      acknowledgedOutsideSnapshotAudience:
        snapshot === null ? null : acknowledgedTotal - snapshot.acknowledged,
      pendingCount: snapshot?.pendingCount ?? pendingCount,
      lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
      canRemind: this.canRemind(row, new Date()),
      sendEmail: row.sendEmail,
      postToTeams: row.postToTeams,
      teamsPostedAt: row.teamsPostedAt?.toISOString() ?? null,
      teamsResult: row.teamsResult,
      emailRuns: emailRuns.map((run) => ({
        ...run,
        createdAt: run.createdAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
      byUnit: (headlineByUnit ?? [...byUnit.values()]).sort((a, b) => a.unit.localeCompare(b.unit)),
      pending: headlinePending.pending,
      pendingNextCursor: headlinePending.pendingNextCursor,
    };
  }

  /** Publish-snapshot side of the report; null when the announcement predates snapshots. */
  private async snapshotReport(row: AnnouncementRow) {
    // Cheap existence check first: announcements published before snapshots
    // existed must not pay for member/acknowledgement scans (BA-04 budget).
    const snapshotCount = await this.prisma.announcementAudienceMember.count({
      where: { announcementId: row.id },
    });
    if (snapshotCount === 0) return null;
    const [membersByUnit, acknowledgedRows, memberRows] = await Promise.all([
      this.prisma.announcementAudienceMember.groupBy({
        by: ['organizationalUnitId'],
        where: { announcementId: row.id },
        _count: { _all: true },
      }),
      this.prisma.announcementAcknowledgement.findMany({
        where: { announcementId: row.id },
        select: { userId: true },
      }),
      this.prisma.announcementAudienceMember.findMany({
        where: { announcementId: row.id },
        select: { userId: true },
      }),
    ]);
    const memberIds = new Set(memberRows.map((member) => member.userId));
    const acknowledgedUserIds = new Set(
      acknowledgedRows.map((ack) => ack.userId).filter((userId) => memberIds.has(userId)),
    );
    const acknowledgedByUnit = await this.prisma.announcementAudienceMember.groupBy({
      by: ['organizationalUnitId'],
      where: { announcementId: row.id, userId: { in: [...acknowledgedUserIds] } },
      _count: { _all: true },
    });
    const acknowledgedPerUnit = new Map(
      acknowledgedByUnit.map((group) => [group.organizationalUnitId, group._count._all]),
    );
    return {
      audienceSize: snapshotCount,
      acknowledged: acknowledgedUserIds.size,
      pendingCount: snapshotCount - acknowledgedUserIds.size,
      acknowledgedUserIds,
      byUnit: membersByUnit.map((group) => ({
        organizationalUnitId: group.organizationalUnitId,
        audience: group._count._all,
        acknowledged: acknowledgedPerUnit.get(group.organizationalUnitId) ?? 0,
      })),
    };
  }

  /** One keyset page of snapshot members who have not acknowledged yet. */
  private async snapshotPendingRows(
    row: AnnouncementRow,
    acknowledgedUserIds: ReadonlySet<string>,
    afterUserId: string | null,
  ) {
    const limit = announcementLimits.reportPendingListed;
    // Scan member pages until one pending page is full (acknowledged members
    // are skipped, never returned), so a dense acknowledged prefix cannot
    // truncate the listing.
    const pendingMembers: Array<{ readonly userId: string; readonly organizationalUnitId: string | null }> = [];
    let cursor = afterUserId;
    let exhausted = false;
    while (pendingMembers.length <= limit && !exhausted) {
      const page = await this.prisma.announcementAudienceMember.findMany({
        where: {
          announcementId: row.id,
          ...(cursor === null ? {} : { userId: { gt: cursor } }),
        },
        select: { userId: true, organizationalUnitId: true },
        orderBy: { userId: 'asc' },
        take: limit + 1,
      });
      if (page.length === 0) {
        exhausted = true;
        break;
      }
      cursor = page.at(-1)?.userId ?? cursor;
      for (const member of page) {
        if (!acknowledgedUserIds.has(member.userId)) pendingMembers.push(member);
      }
      if (page.length < limit + 1) exhausted = true;
    }
    const hasMore = pendingMembers.length > limit;
    const listed = pendingMembers.slice(0, limit);
    const users = await this.prisma.user.findMany({
      where: { id: { in: listed.map((member) => member.userId) } },
      select: { id: true, displayName: true },
    });
    const displayNames = new Map(users.map((user) => [user.id, user.displayName]));
    const unitRows = await this.prisma.organizationalUnit.findMany({
      where: { id: { in: listed.map((m) => m.organizationalUnitId).filter((id): id is string => id !== null) } },
      select: { id: true, name: true },
    });
    const names = new Map(unitRows.map((unit) => [unit.id, unit.name]));
    const lastListed = listed.at(-1);
    return {
      pending: listed.map((member) => ({
        id: member.userId,
        displayName: displayNames.get(member.userId) ?? '',
        unit: member.organizationalUnitId === null ? '' : (names.get(member.organizationalUnitId) ?? ''),
      })),
      pendingNextCursor:
        hasMore && lastListed !== undefined ? encodeAnnouncementReportCursor(row.id, lastListed.userId) : null,
    };
  }

  async reportPending(id: string, cursor: string | null, viewer: AnnouncementViewer) {
    const row = await this.requireReport(id, viewer);
    const afterUserId = decodeAnnouncementReportCursor(cursor, row.id);
    // BA-announcements-13: snapshot basis when captured at publication.
    const snapshot = await this.snapshotReport(row);
    if (snapshot !== null) {
      const page = await this.snapshotPendingRows(row, snapshot.acknowledgedUserIds, afterUserId);
      return { pendingCount: snapshot.pendingCount, ...page };
    }
    const audienceWhere = await this.audienceWhere(audienceOf(row));
    const pendingWhere = this.pendingReportWhere(row, audienceWhere, null);
    const [pendingCount, page] = await Promise.all([
      this.prisma.user.count({ where: pendingWhere }),
      this.reportPendingRows(row, audienceWhere, afterUserId),
    ]);
    return { pendingCount, ...page };
  }

  private reportCsvPage(
    audienceWhere: Prisma.UserWhereInput,
    announcementId: string,
    afterUserId: string | null,
    take: number,
  ): Promise<ReportCsvMember[]> {
    return this.prisma.user.findMany({
      where:
        afterUserId === null
          ? audienceWhere
          : { AND: [audienceWhere, { id: { gt: afterUserId } }] },
      select: {
        id: true,
        displayName: true,
        email: true,
        organizationalUnit: { select: { name: true } },
        announcementAcknowledgements: {
          where: { announcementId },
          select: { acknowledgedAt: true },
          take: 1,
        },
      },
      orderBy: { id: 'asc' },
      take,
    });
  }

  private async *reportCsvChunks(input: {
    readonly row: AnnouncementRow;
    readonly viewer: AnnouncementViewer;
    readonly audienceWhere: Prisma.UserWhereInput;
    readonly firstPage: ReportCsvMember[];
  }): AsyncGenerator<string> {
    let page = input.firstPage;
    let requestedTake: number = announcementLimits.reportCsvBatchSize;
    let exportedRows = 0;
    try {
      // BOM so spreadsheet programs read UTF-8 (č, ć, š, ž, đ).
      yield `\uFEFF${['name', 'email', 'unit', 'acknowledgedAt'].map(csvCell).join(',')}\r\n`;
      while (true) {
        const remainingBudget = announcementLimits.reportCsvMaxRows - exportedRows;
        if (page.length > remainingBudget) {
          throw new AnnouncementError(
            announcementErrorCodes.reportExportTooLarge,
            String(announcementLimits.reportCsvMaxRows),
          );
        }
        if (page.length > 0) {
          const chunk = `${page
            .map((member) =>
              [
                member.displayName,
                member.email,
                member.organizationalUnit?.name ?? '',
                member.announcementAcknowledgements[0]?.acknowledgedAt.toISOString() ?? '',
              ]
                .map(csvCell)
                .join(','),
            )
            .join('\r\n')}\r\n`;
          exportedRows += page.length;
          yield chunk;
        }
        const last = page.at(-1);
        if (last === undefined || page.length < requestedTake) break;
        requestedTake = Math.min(
          announcementLimits.reportCsvBatchSize,
          announcementLimits.reportCsvMaxRows - exportedRows + 1,
        );
        page = await this.reportCsvPage(input.audienceWhere, input.row.id, last.id, requestedTake);
      }
    } finally {
      await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
        action: auditLogActions.announcementReportExported,
        entityType: auditLogEntityTypes.announcement,
        entityId: input.row.id,
        metadata: { rows: exportedRows },
        actorUserId: input.viewer.userId,
      });
    }
  }

  async reportCsv(
    id: string,
    viewer: AnnouncementViewer,
  ): Promise<{ filename: string; stream: Readable }> {
    const row = await this.requireReport(id, viewer);
    const audienceWhere = await this.audienceWhere(audienceOf(row));
    const rowCount = await this.prisma.user.count({ where: audienceWhere });
    if (rowCount > announcementLimits.reportCsvMaxRows) {
      throw new AnnouncementError(
        announcementErrorCodes.reportExportTooLarge,
        String(announcementLimits.reportCsvMaxRows),
      );
    }
    const firstPage = await this.reportCsvPage(
      audienceWhere,
      row.id,
      null,
      announcementLimits.reportCsvBatchSize,
    );
    return {
      filename: `announcement-${id}.csv`,
      stream: Readable.from(this.reportCsvChunks({ row, viewer, audienceWhere, firstPage })),
    };
  }

  private canRemind(row: AnnouncementRow, now: Date): boolean {
    return (
      row.requiresAcknowledgement &&
      effectiveAnnouncementStatus(row, now) === 'PUBLISHED' &&
      (row.lastReminderAt === null || now.getTime() - row.lastReminderAt.getTime() >= announcementLimits.reminderIntervalMs)
    );
  }

  /**
   * Walk every matching user in bounded keyset pages. The page size is a memory
   * bound, not an audience limit; stable ID ordering prevents OFFSET drift.
   */
  private async fanOutAudienceInPages(input: {
    readonly row: AnnouncementRow;
    readonly audience: AnnouncementAudience;
    readonly type: NotificationType;
    readonly dedupePrefix: string;
    readonly additionalWhere?: Prisma.UserWhereInput;
  }): Promise<number> {
    const baseWhere: Prisma.UserWhereInput = {
      ...(await this.audienceWhere(input.audience)),
      ...input.additionalWhere,
    };
    let cursor: string | null = null;
    let sent = 0;
    while (true) {
      const members: { readonly id: string }[] = await this.prisma.user.findMany({
        where: { ...baseWhere, ...(cursor === null ? {} : { id: { gt: cursor } }) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: announcementLimits.notifyBatchSize,
      });
      if (members.length === 0) break;
      sent += await this.fanOut(
        members.map((member) => member.id),
        input.type,
        input.row,
        input.dedupePrefix,
      );
      cursor = members[members.length - 1]!.id;
      if (members.length < announcementLimits.notifyBatchSize) break;
    }
    return sent;
  }

  /** §3.3: one notification to everyone who has not acknowledged, at most once in 24 h. */
  async remind(id: string, viewer: AnnouncementViewer, now: Date = new Date()): Promise<{ notified: number; emailQueued: boolean }> {
    const row = await this.requireReport(id, viewer);
    if (!row.requiresAcknowledgement || effectiveAnnouncementStatus(row, now) !== 'PUBLISHED') {
      throw new AnnouncementError(announcementErrorCodes.notActive);
    }
    if (!this.canRemind(row, now)) throw new AnnouncementError(announcementErrorCodes.reminderTooSoon);
    const notified = await this.fanOutAudienceInPages({
      row,
      audience: audienceOf(row),
      type: notificationTypes.announcementReminder,
      dedupePrefix: `announcement-reminder:${id}:${now.toISOString().slice(0, 10)}`,
      additionalWhere: { announcementAcknowledgements: { none: { announcementId: id } } },
    });
    const since = new Date(now.getTime() - announcementLimits.reminderIntervalMs);
    // BA-announcements-08: the interval claim and the e-mail run are one
    // transaction. If the run cannot be queued, the claim rolls back and the
    // reminder stays retryable instead of losing the e-mail for 24 h.
    const emailQueued = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.announcement.updateMany({
        where: { id, OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: since } }] },
        data: { lastReminderAt: now },
      });
      if (claimed.count !== 1) throw new AnnouncementError(announcementErrorCodes.reminderTooSoon);
      if (!row.sendEmail) return false;
      await this.ensureEmailRun(transaction, id, 'REMINDER');
      return true;
    });
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

  /** In-app notification to the complete audience once the announcement has started (idempotent). */
  async notifyStarted(id: string, now: Date = new Date()): Promise<number> {
    const row = (await this.prisma.announcement.findFirst({
      where: {
        id,
        status: 'PUBLISHED',
        notifyAudience: true,
        audienceNotifiedAt: null,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    })) as AnnouncementRow | null;
    if (row === null) return 0;
    const notified = await this.fanOutAudienceInPages({
      row,
      audience: audienceOf(row),
      type: notificationTypes.announcementPublished,
      dedupePrefix: `announcement-published:${id}`,
    });
    // BA-announcements-08: claim the completion marker and queue the e-mail
    // run atomically. A queue failure rolls the claim back, so the sweep
    // retries instead of permanently losing the publication e-mail.
    const completed = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.announcement.updateMany({
        where: {
          id,
          status: 'PUBLISHED',
          notifyAudience: true,
          audienceNotifiedAt: null,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        data: { audienceNotifiedAt: now },
      });
      if (claimed.count !== 1) return false;
      if (row.sendEmail) await this.ensureEmailRun(transaction, id, 'PUBLISHED');
      return true;
    });
    if (!completed) return 0;
    return notified;
  }

  /** Worker: notifications for announcements that started, and receipt retention. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (!(await this.isEnabled())) return 0;
    const due = await this.prisma.announcement.findMany({
      where: { status: 'PUBLISHED', notifyAudience: true, audienceNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true, startsAt: true },
      orderBy: { startsAt: 'asc' },
      take: 20,
    });
    if (due.length >= 20 && due[0] !== undefined) {
      this.logger.warn(`announcement_sweep_due_cap_reached oldestStartsAt=${due[0].startsAt.toISOString()}`);
    }
    let sent = 0;
    for (const { id } of due) {
      try {
        sent += await this.notifyStarted(id, now);
      } catch (error) {
        this.logger.warn(`announcement_notify_failed id=${id} reason=${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await this.surfaceMissedAnnouncements(now);
    // BA-announcements-17: retention is no longer part of the sweep; it runs as
    // its own hourly job (announcement-retention queue) with job-level retry.
    return sent;
  }

  /**
   * BA-announcements-11 missed-announcement policy: an announcement that
   * started and ended while the sweep was down is NOT distributed late (its
   * display window is over, so the notification, e-mail and Teams post would
   * be stale). Instead every recently missed announcement is alarmed once
   * per sweep within 24 h of its end, so the loss is operator-visible in the
   * worker log rather than silent.
   */
  private async surfaceMissedAnnouncements(now: Date): Promise<void> {
    const missed = await this.prisma.announcement.findMany({
      where: {
        status: 'PUBLISHED',
        notifyAudience: true,
        audienceNotifiedAt: null,
        endsAt: { lte: now, gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true, endsAt: true },
      orderBy: { endsAt: 'asc' },
      take: 20,
    });
    for (const row of missed) {
      this.logger.warn(`announcement_missed_distribution id=${row.id} endsAt=${row.endsAt.toISOString()}`);
    }
  }

  /**
   * §7 + BA-announcements-15 (full retention matrix, owner-approved): N days
   * after the end, receipts go (legal hold keeps a user's own), and so do the
   * satellites — revision text history, e-mail runs, the publish membership
   * snapshot (BA-13) and the in-app notifications the announcement created —
   * while the announcement row and the audit trail stay. A legal hold on ANY
   * snapshot member or receipt holder blocks the satellite deletion for the
   * whole announcement (fail-closed: an error while checking also blocks).
   * The NotificationEmailDelivery ledger is NOT touched here: it belongs to
   * the notifications privacy retention lifecycle (BA-notifications-09).
   */
  /**
   * BA-announcements-17: executed by the dedicated retention job. Unlike the
   * old in-sweep pass, failures PROPAGATE so the job fails and BullMQ retries
   * it (announcement-retention queue, 3 attempts). Returns the total number of
   * deleted rows for the job metric. A single announcement's satellite failure
   * stays fail-closed for that announcement (legal-hold semantics), is
   * collected, and fails the run at the end if any occurred.
   */
  async runRetention(now: Date): Promise<number> {
    const days = Number(
      await this.readSetting(settingKeys.privateAnnouncementsReceiptRetentionDays, announcementDefaults.receiptRetentionDays),
    );
    if (!Number.isFinite(days) || days <= 0) return 0;
    const cutoff = new Date(now.getTime() - days * dayMs);
    const where = { announcement: { endsAt: { lt: cutoff } }, user: { legalHoldAt: null } };
    const receipts = await this.prisma.announcementAcknowledgement.deleteMany({ where });
    const dismissals = await this.prisma.announcementDismissal.deleteMany({ where });
    const satellites = await this.applySatelliteRetention(cutoff);
    return receipts.count + dismissals.count + satellites;
  }

  private async applySatelliteRetention(cutoff: Date): Promise<number> {
    const eligible = await this.prisma.announcement.findMany({
      where: { endsAt: { lt: cutoff }, status: { not: 'DRAFT' } },
      select: { id: true },
      orderBy: { endsAt: 'asc' },
      take: 100,
    });
    let deleted = 0;
    const failedIds: string[] = [];
    for (const { id } of eligible) {
      try {
        const result = await this.retainAnnouncementSatellites(id);
        if (result !== null) {
          deleted += result.revisions + result.emailRuns + result.audienceMembers + result.notifications;
        }
      } catch (error) {
        // Fail-closed per announcement: satellites stay; the run fails below
        // so the job retry (or the next hourly run) tries again.
        failedIds.push(id);
        this.logger.error(
          `announcement_satellite_retention_failed id=${id} reason=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
    }
    if (failedIds.length > 0) {
      throw new Error(`announcement_retention_incomplete ids=${failedIds.join(',')}`);
    }
    return deleted;
  }

  private async retainAnnouncementSatellites(announcementId: string): Promise<Record<string, number> | null> {
    const [revisions, runs, members, notifications] = await Promise.all([
      this.prisma.announcementRevision.count({ where: { announcementId } }),
      this.prisma.announcementEmailRun.count({ where: { announcementId } }),
      this.prisma.announcementAudienceMember.count({ where: { announcementId } }),
      this.prisma.notification.count({
        where: { payload: { path: ['announcementId'], equals: announcementId } },
      }),
    ]);
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { teamsPostedAt: true, teamsResult: true },
    });
    const hasSatellites =
      revisions > 0 || runs > 0 || members > 0 || notifications > 0 ||
      announcement?.teamsPostedAt !== null || announcement?.teamsResult !== null;
    if (!hasSatellites) return null;
    // Legal hold gate (fail-closed): any held member or receipt holder keeps
    // every satellite of this announcement.
    const [memberIds, ackHolders, dismissalHolders] = await Promise.all([
      this.prisma.announcementAudienceMember.findMany({ where: { announcementId }, select: { userId: true } }),
      this.prisma.announcementAcknowledgement.findMany({ where: { announcementId }, select: { userId: true } }),
      this.prisma.announcementDismissal.findMany({ where: { announcementId }, select: { userId: true } }),
    ]);
    const involvedUserIds = [...new Set([
      ...memberIds.map((row) => row.userId),
      ...ackHolders.map((row) => row.userId),
      ...dismissalHolders.map((row) => row.userId),
    ])];
    if (involvedUserIds.length > 0) {
      const held = await this.prisma.user.count({
        where: { id: { in: involvedUserIds }, legalHoldAt: { not: null } },
      });
      if (held > 0) return null;
    }
    const deleted = await this.prisma.$transaction(async (transaction) => {
      const revisionResult = await transaction.announcementRevision.deleteMany({ where: { announcementId } });
      const runResult = await transaction.announcementEmailRun.deleteMany({ where: { announcementId } });
      const memberResult = await transaction.announcementAudienceMember.deleteMany({ where: { announcementId } });
      const notificationResult = await transaction.notification.deleteMany({
        where: { payload: { path: ['announcementId'], equals: announcementId } },
      });
      // Teams delivery evidence on the announcement row itself.
      await transaction.announcement.update({
        where: { id: announcementId },
        data: { teamsPostedAt: null, teamsResult: null },
      });
      return {
        revisions: revisionResult.count,
        emailRuns: runResult.count,
        audienceMembers: memberResult.count,
        notifications: notificationResult.count,
      };
    });
    this.logger.log(
      `announcement_satellite_retention_applied id=${announcementId} revisions=${deleted.revisions} emailRuns=${deleted.emailRuns} audienceMembers=${deleted.audienceMembers} notifications=${deleted.notifications}`,
    );
    return deleted;
  }

  // ------------------------------------------------------------ helpers

  /**
   * K2b + BA-announcements-08: queue the worker e-mail run inside the caller's
   * claim transaction. An already-open run for the same announcement and kind
   * is reused instead of duplicated (the delivery ledger dedupes per run, so
   * a second open run would mail the audience twice).
   */
  private async ensureEmailRun(
    transaction: Prisma.TransactionClient,
    announcementId: string,
    kind: 'PUBLISHED' | 'REMINDER',
  ): Promise<void> {
    const open = await transaction.announcementEmailRun.findFirst({
      where: { announcementId, kind, completedAt: null },
      select: { id: true },
    });
    if (open === null) {
      await transaction.announcementEmailRun.create({ data: { announcementId, kind } });
    }
  }

  private async fanOut(userIds: readonly string[], type: NotificationType, row: AnnouncementRow, dedupePrefix: string): Promise<number> {
    if (userIds.length === 0) return 0;
    const policy = await loadNotificationPreferencePolicy(this.settings);
    const decisions = await resolveDeliveryDecisions(this.prisma, policy, { type, userIds });
    let sent = 0;
    for (const userId of userIds) {
      const decision = decisions.get(userId);
      if (decision?.inApp === false) continue;
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
          decision,
        );
        if (created !== null) {
          sent += 1;
          // BA-announcements-20: the same fan-out that writes the inbox row pokes the
          // signed-in client to refetch its active announcements (banner/modal).
          this.realtimeHub?.publishAnnouncementChanged({
            userId,
            announcementId: row.id,
            occurredAt: new Date().toISOString(),
          });
        }
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
