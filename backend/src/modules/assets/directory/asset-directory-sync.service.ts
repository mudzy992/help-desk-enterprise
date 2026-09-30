import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { DirectorySyncError } from '../../directory-sync/directory-sync.error';
import { DirectoryBackoff } from '../../directory-sync/ldaps/directory-backoff';
import type { LdapClientFactory } from '../../directory-sync/ldaps/ldap-directory-client';
import { withLdapsSession } from '../../directory-sync/ldaps/ldaps-directory-reader';
import type { LdapsDirectoryComputerEntry, OrganizationalUnitMappingOverride } from '../../directory-sync/ldaps/ldaps-directory.types';
import { LdapsSyncConfigurationLoader } from '../../directory-sync/ldaps/ldaps-sync-configuration.loader';
import { LDAP_CLIENT_FACTORY } from '../../directory-sync/ldaps/ldaps-sync.tokens';
import { assetDefaults, parseUserMatch } from '../../settings/definitions/asset-settings';
import { settingKeys } from '../../settings/setting-keys';
import { AssetAccessService } from '../asset-access.service';
import { AssetError, assetErrorCodes, assetEventActions, type AssetStatusValue } from '../assets.constants';
import { allocateAssetTags } from '../asset-tags';
import {
  planDirectoryComputers,
  type DirectoryAssetState,
  type DirectoryConflict,
  type DirectoryPlan,
  type DirectoryPlanTotals,
  type DirectorySkip,
  type DirectoryTypeTarget,
} from './plan-directory-computers';

export const assetDirectorySyncLimits = {
  /** Upper bound of computers per run; more means the base DN is too wide. */
  maxComputers: 50_000,
  reportItems: 200,
  auditItems: 50,
  createBatch: 200,
} as const;

/** Stable id of the audit trail (entityType `asset`) — the run history. */
export const assetDirectorySyncEntityId = 'directory-sync';

export type DirectorySyncTrigger = 'manual' | 'scheduled' | 'cli';

export type DirectorySyncReport = {
  readonly dryRun: boolean;
  readonly trigger: DirectorySyncTrigger;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly totals: DirectoryPlanTotals;
  readonly applied: { readonly created: number; readonly updated: number; readonly failed: number } | null;
  readonly missingGuardTripped: boolean;
  readonly wouldFlagMissing: number;
  readonly conflicts: readonly (DirectoryConflict & { readonly assignedUser: string | null; readonly suggestedUser: string | null })[];
  readonly skipped: readonly DirectorySkip[];
  readonly preview: readonly { readonly name: string; readonly action: string; readonly changes: readonly string[] }[];
  readonly domainController: string | null;
};

export type DirectorySyncStatus = {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly intervalHours: number;
  readonly lastRun: { readonly at: string; readonly dryRun: boolean; readonly trigger: string; readonly totals: unknown; readonly conflicts: readonly DescribedConflict[]; readonly missingGuardTripped: boolean } | null;
  readonly lastApplied: { readonly at: string } | null;
  readonly directoryAssets: number;
  readonly missingAssets: number;
};

/**
 * Paket 3.2 (§12): AD computers → assets. Read-only towards AD, never deletes
 * or retires an asset, and every write is optimistic (version) so a parallel
 * manual edit wins. Dry-run is allowed while the sync is still switched off —
 * it is the first step of the activation runbook.
 */
@Injectable()
export class AssetDirectorySyncService {
  private readonly logger = new Logger(AssetDirectorySyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AssetAccessService,
    private readonly ldapsConfiguration: LdapsSyncConfigurationLoader,
    private readonly backoff: DirectoryBackoff,
    @Optional() @Inject(LDAP_CLIENT_FACTORY) private readonly clientFactory?: LdapClientFactory,
  ) {}

  async status(): Promise<DirectorySyncStatus> {
    const [enabled, intervalHours, configuration, lastRun, lastApplied, directoryAssets, missingAssets] = await Promise.all([
      this.access.readSetting<unknown>(settingKeys.privateAssetsDirectorySyncEnabled, assetDefaults.directorySyncEnabled),
      this.access.readSetting<number>(settingKeys.privateAssetsDirectorySyncIntervalHours, assetDefaults.directorySyncIntervalHours),
      this.ldapsConfiguration.load().catch(() => null),
      this.lastAudit([auditLogActions.assetDirectorySyncApplied, auditLogActions.assetDirectorySyncDryRun]),
      this.lastAudit([auditLogActions.assetDirectorySyncApplied]),
      this.prisma.asset.count({ where: { externalId: { not: null } } }),
      this.prisma.asset.count({ where: { externalId: { not: null }, missingFromDirectoryAt: { not: null } } }),
    ]);
    const metadata = (lastRun?.metadata ?? {}) as Record<string, unknown>;
    const conflicts = await this.describeConflicts(Array.isArray(metadata.conflicts) ? (metadata.conflicts as StoredConflict[]) : []);
    return {
      enabled: enabled === true,
      configured: configuration !== null && configuration.source === 'ldaps' && configuration.enabled,
      intervalHours,
      lastRun: lastRun
        ? {
            at: lastRun.createdAt.toISOString(),
            dryRun: lastRun.action === auditLogActions.assetDirectorySyncDryRun,
            trigger: String(metadata.trigger ?? 'manual'),
            totals: metadata.totals ?? null,
            conflicts,
            missingGuardTripped: metadata.missingGuardTripped === true,
          }
        : null,
      lastApplied: lastApplied ? { at: lastApplied.createdAt.toISOString() } : null,
      directoryAssets,
      missingAssets,
    };
  }

  /** Scheduler tick: runs when enabled and the interval since the last applied run has passed. */
  async runIfDue(): Promise<DirectorySyncReport | null> {
    if (!(await this.access.isEnabled())) return null;
    const enabled = await this.access.readSetting<unknown>(settingKeys.privateAssetsDirectorySyncEnabled, false);
    if (enabled !== true) return null;
    const intervalHours = await this.access.readSetting<number>(settingKeys.privateAssetsDirectorySyncIntervalHours, assetDefaults.directorySyncIntervalHours);
    const last = await this.lastAudit([auditLogActions.assetDirectorySyncApplied]);
    // 5 min slack so an hourly tick does not slip a whole hour.
    if (last !== null && Date.now() - last.createdAt.getTime() < intervalHours * 3_600_000 - 300_000) return null;
    return this.run({ dryRun: false, actorUserId: null, trigger: 'scheduled' });
  }

  async run(input: { readonly dryRun: boolean; readonly actorUserId: string | null; readonly trigger: DirectorySyncTrigger; readonly reason?: string }): Promise<DirectorySyncReport> {
    await this.access.requireEnabled();
    if (!input.dryRun) {
      const enabled = await this.access.readSetting<unknown>(settingKeys.privateAssetsDirectorySyncEnabled, false);
      if (enabled !== true) throw new AssetError(assetErrorCodes.directorySyncDisabled);
    }
    if (this.running) throw new AssetError(assetErrorCodes.directoryUnavailable, 'busy');
    this.running = true;
    const startedAt = Date.now();
    try {
      const configuration = await this.ldapsConfiguration.load().catch((error: unknown) => {
        throw new AssetError(assetErrorCodes.directoryNotConfigured, error instanceof DirectorySyncError ? error.code : 'unreadable');
      });
      if (configuration.source !== 'ldaps' || !configuration.enabled) {
        throw new AssetError(assetErrorCodes.directoryNotConfigured, 'ldaps_disabled');
      }
      const [baseDn, includeDisabled] = await Promise.all([
        this.access.readSetting<string>(settingKeys.privateAssetsDirectorySyncBaseDn, assetDefaults.directorySyncBaseDn),
        this.access.readSetting<unknown>(settingKeys.privateAssetsDirectorySyncIncludeDisabled, false),
      ]);
      let read: { result: LdapsDirectoryComputerEntry[]; session: { url: string } };
      try {
        read = await withLdapsSession({
          configuration,
          backoff: this.backoff,
          now: Date.now,
          factory: this.clientFactory,
          work: (reader) => reader.readComputers(baseDn, includeDisabled === true),
        });
      } catch (error) {
        if (error instanceof DirectorySyncError) {
          const code = error.code === 'DIRECTORY_NOT_CONFIGURED' ? assetErrorCodes.directoryNotConfigured : assetErrorCodes.directoryUnavailable;
          const detail = String((error.details as { errorCode?: unknown } | undefined)?.errorCode ?? error.code);
          throw new AssetError(code, detail);
        }
        throw error;
      }
      if (read.result.length > assetDirectorySyncLimits.maxComputers) {
        throw new AssetError(assetErrorCodes.directoryUnavailable, 'too_many_computers');
      }
      const plan = await this.plan(read.result, configuration.ouMappingOverrides, configuration.maxDeactivationPercent);
      const applied = input.dryRun ? null : await this.apply(plan, input.actorUserId);
      const report = await this.report(plan, input, startedAt, applied, read.session.url);
      await this.audit(report, input.actorUserId, input.reason);
      this.logger.log(
        `asset_directory_sync dryRun=${input.dryRun} trigger=${input.trigger} seen=${plan.totals.seen} create=${plan.totals.create} update=${plan.totals.update + plan.totals.adopt + plan.totals.restore} missing=${plan.totals.missing} conflicts=${plan.totals.conflicts} guard=${plan.missingGuardTripped}`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }

  private async plan(computers: LdapsDirectoryComputerEntry[], overrides: readonly OrganizationalUnitMappingOverride[], maxMissingPercent: number): Promise<DirectoryPlan> {
    const [typeKey, serverTypeKey, userMatchRaw, namePattern, defaultUnitId] = await Promise.all([
      this.access.readSetting<string>(settingKeys.privateAssetsDirectorySyncTypeKey, assetDefaults.directorySyncTypeKey),
      this.access.readSetting<string>(settingKeys.privateAssetsDirectorySyncServerTypeKey, assetDefaults.directorySyncServerTypeKey),
      this.access.readSetting<string>(settingKeys.privateAssetsDirectorySyncUserMatch, assetDefaults.directorySyncUserMatch),
      this.access.readSetting<string>(settingKeys.privateAssetsDirectorySyncNamePattern, assetDefaults.directorySyncNamePattern),
      this.access.readSetting<string>(settingKeys.privateAssetsDirectorySyncDefaultOrganizationalUnitId, assetDefaults.directorySyncDefaultOrganizationalUnitId),
    ]);
    const types = await this.prisma.assetType.findMany({
      where: { key: { in: [typeKey, serverTypeKey] }, archivedAt: null },
      select: { id: true, key: true, attributes: { where: { archivedAt: null }, select: { key: true } } },
    });
    const target = (key: string): DirectoryTypeTarget | null => {
      const type = types.find((entry) => entry.key === key);
      return type ? { id: type.id, key: type.key, attributeKeys: new Set(type.attributes.map((attribute) => attribute.key)) } : null;
    };
    const assetSelect = {
      id: true,
      externalId: true,
      source: true,
      typeId: true,
      name: true,
      status: true,
      organizationalUnitId: true,
      assignedUserId: true,
      assignmentSuggested: true,
      lastSeenAt: true,
      missingFromDirectoryAt: true,
      attributes: true,
      version: true,
    } as const;
    const hostnames = [...new Set(computers.flatMap((computer) => [computer.name, computer.dnsHostName, computer.dnsHostName?.split('.')[0]]).filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))];
    const [linked, adoptRows, users, units] = await Promise.all([
      this.prisma.asset.findMany({ where: { externalId: { not: null } }, select: assetSelect }),
      hostnames.length === 0
        ? Promise.resolve([])
        : this.prisma.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Asset"
            WHERE "externalId" IS NULL AND "status" NOT IN ('DISPOSED')
              AND lower("attributes"->>'hostname') = ANY(${hostnames})`,
      this.prisma.user.findMany({ where: { anonymizedAt: null }, select: { id: true, email: true, distinguishedName: true, isActive: true } }),
      this.prisma.organizationalUnit.findMany({ select: { id: true, ouPath: true, distinguishedName: true } }),
    ]);
    const adoptAssets = adoptRows.length === 0 ? [] : await this.prisma.asset.findMany({ where: { id: { in: adoptRows.map((row) => row.id) } }, select: assetSelect });
    const adoptable = new Map<string, DirectoryAssetState[]>();
    for (const asset of adoptAssets) {
      const hostname = String((asset.attributes as Record<string, unknown>).hostname ?? '').toLowerCase();
      if (hostname === '') continue;
      adoptable.set(hostname, [...(adoptable.get(hostname) ?? []), toState(asset)]);
    }
    return planDirectoryComputers({
      computers,
      linked: linked.map(toState),
      adoptable,
      users,
      units,
      overrides,
      computerType: target(typeKey),
      serverType: serverTypeKey === typeKey ? null : target(serverTypeKey),
      userMatch: parseUserMatch(userMatchRaw) ?? ['managedBy', 'namePattern'],
      namePattern,
      defaultUnitId: defaultUnitId === '' ? null : defaultUnitId,
      maxMissingPercent,
      now: new Date(),
    });
  }

  private async apply(plan: DirectoryPlan, actorUserId: string | null) {
    let created = 0;
    let updated = 0;
    let failed = 0;
    const prefix = await this.access.readSetting<string>(settingKeys.privateAssetsTagPrefix, assetDefaults.tagPrefix);

    for (let offset = 0; offset < plan.creates.length; offset += assetDirectorySyncLimits.createBatch) {
      const batch = plan.creates.slice(offset, offset + assetDirectorySyncLimits.createBatch);
      try {
        await this.prisma.$transaction(async (transaction) => {
          const tags = await allocateAssetTags(transaction, batch.length, prefix);
          const now = new Date();
          await transaction.asset.createMany({
            data: batch.map((entry, index) => ({
              assetTag: tags[index],
              typeId: entry.typeId,
              name: entry.name,
              status: entry.status,
              organizationalUnitId: entry.organizationalUnitId,
              assignedUserId: entry.assignedUserId,
              assignedAt: entry.assignedUserId ? now : null,
              assignmentSuggested: entry.assignedUserId !== null,
              attributes: entry.attributes as Prisma.InputJsonValue,
              source: 'DIRECTORY' as const,
              externalId: entry.externalId,
              lastSeenAt: entry.lastSeenAt,
            })),
          });
          const rows = await transaction.asset.findMany({ where: { externalId: { in: batch.map((entry) => entry.externalId) } }, select: { id: true, externalId: true } });
          const byExternal = new Map(batch.map((entry) => [entry.externalId, entry]));
          await transaction.assetEvent.createMany({
            data: rows.map((row) => ({
              assetId: row.id,
              action: assetEventActions.directorySync,
              actorUserId,
              detail: { kind: 'created', userMatchedBy: byExternal.get(row.externalId as string)?.userMatchedBy ?? null } as Prisma.InputJsonValue,
            })),
          });
        });
        created += batch.length;
      } catch (error) {
        failed += batch.length;
        this.logger.warn(`asset_directory_sync_create_failed count=${batch.length} reason=${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
      }
    }

    for (const entry of plan.updates) {
      try {
        const data: Prisma.AssetUpdateManyMutationInput = {
          ...entry.data,
          status: entry.data.status as AssetStatusValue | undefined,
          attributes: entry.data.attributes as Prisma.InputJsonValue | undefined,
        };
        if (entry.data.assignedUserId !== undefined) data.assignedAt = entry.data.assignedUserId ? new Date() : null;
        if (entry.changes.length > 0) data.version = { increment: 1 };
        const done = await this.prisma.$transaction(async (transaction) => {
          const result = await transaction.asset.updateMany({ where: { id: entry.assetId, version: entry.version }, data });
          if (result.count === 0) return false;
          if (entry.changes.length > 0) {
            await transaction.assetEvent.create({
              data: {
                assetId: entry.assetId,
                action: assetEventActions.directorySync,
                actorUserId,
                detail: { kind: entry.kind, changes: entry.changes, userMatchedBy: entry.userMatchedBy } as Prisma.InputJsonValue,
              },
            });
          }
          return true;
        });
        if (done) updated += 1;
        else failed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`asset_directory_sync_update_failed asset=${entry.assetId} reason=${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
      }
    }
    return { created, updated, failed };
  }

  private async report(
    plan: DirectoryPlan,
    input: { readonly dryRun: boolean; readonly trigger: DirectorySyncTrigger },
    startedAt: number,
    applied: DirectorySyncReport['applied'],
    url: string,
  ): Promise<DirectorySyncReport> {
    const conflicts = plan.conflicts.slice(0, assetDirectorySyncLimits.reportItems);
    const userIds = [...new Set(conflicts.flatMap((conflict) => [conflict.assignedUserId, conflict.suggestedUserId]))];
    const assetIds = plan.updates.slice(0, assetDirectorySyncLimits.reportItems).map((entry) => entry.assetId);
    const [users, assets] = await Promise.all([
      userIds.length === 0 ? [] : this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }),
      assetIds.length === 0 ? [] : this.prisma.asset.findMany({ where: { id: { in: assetIds } }, select: { id: true, name: true } }),
    ]);
    const userLabel = new Map(users.map((user) => [user.id, `${user.displayName} <${user.email}>`]));
    const assetName = new Map(assets.map((asset) => [asset.id, asset.name]));
    const preview = [
      ...plan.creates.map((entry) => ({ name: entry.name, action: 'create', changes: [] as string[] })),
      ...plan.updates.map((entry) => ({ name: assetName.get(entry.assetId) ?? entry.assetId, action: entry.kind, changes: [...entry.changes] })),
    ].slice(0, assetDirectorySyncLimits.reportItems);
    return {
      dryRun: input.dryRun,
      trigger: input.trigger,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      totals: plan.totals,
      applied,
      missingGuardTripped: plan.missingGuardTripped,
      wouldFlagMissing: plan.wouldFlagMissing,
      conflicts: conflicts.map((conflict) => ({
        ...conflict,
        assignedUser: userLabel.get(conflict.assignedUserId) ?? null,
        suggestedUser: userLabel.get(conflict.suggestedUserId) ?? null,
      })),
      skipped: plan.skipped.slice(0, assetDirectorySyncLimits.reportItems),
      preview,
      domainController: url,
    };
  }

  private async audit(report: DirectorySyncReport, actorUserId: string | null, reason?: string) {
    try {
      await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
        action: report.dryRun ? auditLogActions.assetDirectorySyncDryRun : auditLogActions.assetDirectorySyncApplied,
        entityType: auditLogEntityTypes.asset,
        entityId: assetDirectorySyncEntityId,
        actorUserId,
        metadata: {
          trigger: report.trigger,
          ...(reason ? { reason: reason.slice(0, 500) } : {}),
          totals: report.totals,
          applied: report.applied,
          missingGuardTripped: report.missingGuardTripped,
          wouldFlagMissing: report.wouldFlagMissing,
          durationMs: report.durationMs,
          // Ids only (no names or e-mails) — the UI resolves them on display.
          conflicts: report.conflicts.slice(0, assetDirectorySyncLimits.auditItems).map((conflict) => ({
            assetId: conflict.assetId,
            assignedUserId: conflict.assignedUserId,
            suggestedUserId: conflict.suggestedUserId,
            matchedBy: conflict.matchedBy,
          })),
        } as never,
      });
    } catch (error) {
      this.logger.warn(`asset_directory_sync_audit_failed reason=${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /** Names for the ids stored in the audit (current names; removed items are dropped). */
  private async describeConflicts(stored: readonly StoredConflict[]): Promise<DescribedConflict[]> {
    const valid = stored.filter((item) => typeof item?.assetId === 'string' && typeof item.assignedUserId === 'string' && typeof item.suggestedUserId === 'string');
    if (valid.length === 0) return [];
    const [assets, users] = await Promise.all([
      this.prisma.asset.findMany({ where: { id: { in: valid.map((item) => item.assetId) } }, select: { id: true, name: true, assetTag: true, assignedUserId: true } }),
      this.prisma.user.findMany({ where: { id: { in: valid.flatMap((item) => [item.assignedUserId, item.suggestedUserId]) } }, select: { id: true, displayName: true, email: true } }),
    ]);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const userLabel = new Map(users.map((user) => [user.id, `${user.displayName} <${user.email}>`]));
    return valid.flatMap((item) => {
      const asset = assetById.get(item.assetId);
      // Resolved since (reassigned by hand to the suggested user or unassigned): not a conflict any more.
      if (!asset || asset.assignedUserId !== item.assignedUserId) return [];
      return [{ assetId: asset.id, name: asset.name, assetTag: asset.assetTag, assignedUser: userLabel.get(item.assignedUserId) ?? null, suggestedUser: userLabel.get(item.suggestedUserId) ?? null, matchedBy: String(item.matchedBy ?? '') }];
    });
  }

  private lastAudit(actions: readonly string[]) {
    return this.prisma.auditLog.findFirst({
      where: { entityType: auditLogEntityTypes.asset, entityId: assetDirectorySyncEntityId, action: { in: [...actions] } },
      orderBy: { createdAt: 'desc' },
      select: { action: true, createdAt: true, metadata: true },
    });
  }
}

type StoredConflict = { assetId: string; assignedUserId: string; suggestedUserId: string; matchedBy?: string };
export type DescribedConflict = {
  readonly assetId: string;
  readonly name: string;
  readonly assetTag: string;
  readonly assignedUser: string | null;
  readonly suggestedUser: string | null;
  readonly matchedBy: string;
};

function toState(asset: {
  id: string;
  externalId: string | null;
  source: 'MANUAL' | 'IMPORT' | 'DIRECTORY';
  typeId: string;
  name: string;
  status: string;
  organizationalUnitId: string;
  assignedUserId: string | null;
  assignmentSuggested: boolean;
  lastSeenAt: Date | null;
  missingFromDirectoryAt: Date | null;
  attributes: unknown;
  version: number;
}): DirectoryAssetState {
  return { ...asset, attributes: (asset.attributes ?? {}) as Record<string, unknown> };
}
