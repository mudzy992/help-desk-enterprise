import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PrincipalContextInvalidator } from '../../../common/principal-context/principal-context-invalidator.service';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import { authenticationConstants } from '../../authentication/authentication.constants';
import { SessionRevocationStore } from '../../authentication/session-revocation.store';
import { persistInAppNotification } from '../../notifications/fan-out/persist-in-app-notification';
import { notificationTypes } from '../../notifications/notifications.constants';
import { DirectorySyncError } from '../directory-sync.error';
import { applyDirectorySyncPlan, type DirectorySyncApplyResult } from './apply-directory-sync-plan';
import { buildDirectorySyncPlan } from './build-directory-sync-plan';
import { cronFiredBetween } from './cron-schedule';
import { DirectoryBackoff } from './directory-backoff';
import {
  summarizeDirectorySyncPlan,
  type DirectorySyncPlan,
  type DirectorySyncPlanSummary,
} from './directory-sync-plan.types';
import type { LdapClientFactory } from './ldap-directory-client';
import { withLdapsSession, type LdapsSessionInfo } from './ldaps-directory-reader';
import type { LdapsSyncConfiguration } from './ldaps-directory.types';
import { LdapsSyncConfigurationLoader } from './ldaps-sync-configuration.loader';
import { LDAP_CLIENT_FACTORY } from './ldaps-sync.tokens';
import { loadDirectorySyncState } from './load-directory-sync-state';

export const directoryFullSyncLimits = {
  /** A dry-run can be applied within this window; afterwards it is stale. */
  planApplyWindowMilliseconds: 60 * 60_000,
  /** A RUNNING row older than this is considered dead (crashed process). */
  runLeaseMilliseconds: 30 * 60_000,
  planRetentionDays: 30,
  historySize: 10,
  scheduleTimeZone: 'Europe/Sarajevo',
} as const;

export type DirectoryTestConnectionResult = {
  readonly runId: string;
  readonly url: string;
  readonly failedUrls: LdapsSessionInfo['failedUrls'];
  readonly durationMs: number;
  readonly baseFound: boolean;
  readonly certificate: 'system_trust' | 'custom_ca';
};

export type DirectoryDryRunResult = {
  readonly runId: string;
  readonly durationMs: number;
  readonly url: string;
  readonly queries: number;
  readonly summary: DirectorySyncPlanSummary;
  readonly plan: DirectorySyncPlan;
  readonly applicableUntil: string;
};

export type DirectoryApplyResult = {
  readonly runId: string;
  readonly dryRunId: string | null;
  readonly durationMs: number;
  readonly result: DirectorySyncApplyResult;
};

type RunKind = 'TEST_CONNECTION' | 'DRY_RUN' | 'APPLY' | 'SCHEDULED';

/**
 * Paket 1.8 (A3/A4): LDAPS test connection, dry-run, apply and scheduled sync.
 * Every run is recorded in `DirectorySyncRun` and audited. Guarded by the
 * backoff (after errors), a cooldown between full reads, a single-run lease
 * and the deactivation safeguard.
 */
@Injectable()
export class DirectoryFullSyncService {
  private readonly logger = new Logger(DirectoryFullSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: LdapsSyncConfigurationLoader,
    private readonly backoff: DirectoryBackoff,
    @Optional() private readonly principalContextInvalidator?: PrincipalContextInvalidator,
    @Optional() private readonly sessionRevocationStore?: SessionRevocationStore,
    @Optional() @Inject(LDAP_CLIENT_FACTORY) private readonly clientFactory?: LdapClientFactory,
  ) {}

  async testConnection(actorUserId: string | null): Promise<DirectoryTestConnectionResult> {
    const configuration = await this.loadLdaps();
    const startedAt = Date.now();
    const run = await this.startRun('TEST_CONNECTION', actorUserId, false);
    try {
      const { result, session } = await withLdapsSession({
        configuration,
        backoff: this.backoff,
        now: Date.now,
        factory: this.clientFactory,
        work: (reader) => reader.probe(),
      });
      const response: DirectoryTestConnectionResult = {
        runId: run.id,
        url: session.url,
        failedUrls: session.failedUrls,
        durationMs: Date.now() - startedAt,
        baseFound: result > 0,
        certificate: configuration.connection.caCertificatePem ? 'custom_ca' : 'system_trust',
      };
      await this.finishRun(run.id, startedAt, 'SUCCEEDED', { ...response }, null, null);
      await this.audit(auditLogActions.directoryTestConnection, run.id, actorUserId, {
        url: response.url, baseFound: response.baseFound, failedUrls: response.failedUrls.length,
      });
      return response;
    } catch (error) {
      await this.failRun(run.id, startedAt, error);
      throw error;
    }
  }

  async dryRun(actorUserId: string | null): Promise<DirectoryDryRunResult> {
    const configuration = await this.loadLdaps();
    await this.assertCooldown(configuration);
    const startedAt = Date.now();
    const run = await this.startRun('DRY_RUN', actorUserId, true);
    try {
      const { plan, session } = await this.computePlan(configuration);
      const summary = summarizeDirectorySyncPlan(plan);
      await this.finishRun(run.id, startedAt, 'SUCCEEDED', { ...summary, url: session.url, queries: session.queries }, plan, null);
      await this.audit(auditLogActions.directoryDryRun, run.id, actorUserId, {
        usersCreated: summary.usersCreated,
        usersUpdated: summary.usersUpdated,
        usersDeactivated: summary.usersDeactivated,
        exceptions: summary.exceptions,
        safeguardTripped: summary.safeguard.tripped,
      });
      return {
        runId: run.id,
        durationMs: Date.now() - startedAt,
        url: session.url,
        queries: session.queries,
        summary,
        plan,
        applicableUntil: new Date(startedAt + directoryFullSyncLimits.planApplyWindowMilliseconds).toISOString(),
      };
    } catch (error) {
      await this.failRun(run.id, startedAt, error);
      throw error;
    }
  }

  /** Applies exactly the plan of a recent dry-run (no second directory read). */
  async apply(dryRunId: string, actorUserId: string | null): Promise<DirectoryApplyResult> {
    const dryRun = await this.prisma.directorySyncRun.findUnique({ where: { id: dryRunId } });
    if (dryRun === null || dryRun.kind !== 'DRY_RUN' || dryRun.status !== 'SUCCEEDED' || dryRun.plan === null) {
      throw new DirectorySyncError('DIRECTORY_PLAN_NOT_FOUND');
    }
    if (dryRun.appliedByRunId !== null) {
      throw new DirectorySyncError('DIRECTORY_PLAN_ALREADY_APPLIED');
    }
    if (Date.now() - dryRun.startedAt.getTime() > directoryFullSyncLimits.planApplyWindowMilliseconds) {
      throw new DirectorySyncError('DIRECTORY_PLAN_EXPIRED');
    }
    const plan = dryRun.plan as unknown as DirectorySyncPlan;
    if (plan.safeguard.tripped) {
      await this.audit(auditLogActions.directorySyncAborted, dryRun.id, actorUserId, { ...plan.safeguard });
      throw new DirectorySyncError('DIRECTORY_SAFEGUARD_TRIPPED', 'Safeguard', { ...plan.safeguard });
    }
    const startedAt = Date.now();
    const run = await this.startRun('APPLY', actorUserId, true);
    // Claim the dry-run first: two clicks cannot apply the same plan twice.
    const claimed = await this.prisma.directorySyncRun.updateMany({
      where: { id: dryRun.id, appliedByRunId: null },
      data: { appliedByRunId: run.id },
    });
    if (claimed.count !== 1) {
      await this.finishRun(run.id, startedAt, 'FAILED', null, null, 'DIRECTORY_PLAN_ALREADY_APPLIED');
      throw new DirectorySyncError('DIRECTORY_PLAN_ALREADY_APPLIED');
    }
    try {
      const result = await this.executePlan(plan);
      await this.finishRun(run.id, startedAt, 'SUCCEEDED', { ...result, dryRunId: dryRun.id }, null, null);
      await this.audit(auditLogActions.directorySyncApplied, run.id, actorUserId, {
        ...countsOnly(result), dryRunId: dryRun.id,
      });
      return { runId: run.id, dryRunId: dryRun.id, durationMs: Date.now() - startedAt, result };
    } catch (error) {
      await this.failRun(run.id, startedAt, error);
      throw error;
    }
  }

  /**
   * Worker tick (every 15 min): runs a fresh read + apply when the configured
   * cron fired since the last scheduled run. Idempotent per window.
   */
  async runScheduledIfDue(now: Date = new Date()): Promise<'skipped' | 'applied' | 'aborted'> {
    const configuration = await this.configurationLoader.load();
    if (!configuration.enabled || configuration.source !== 'ldaps' || configuration.strategy !== 'scheduled') {
      return 'skipped';
    }
    const last = await this.prisma.directorySyncRun.findFirst({
      where: { kind: 'SCHEDULED' },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    const since = last?.startedAt ?? new Date(now.getTime() - 16 * 60_000);
    if (!cronFiredBetween(configuration.scheduleCron, since, now, directoryFullSyncLimits.scheduleTimeZone)) {
      return 'skipped';
    }
    const startedAt = Date.now();
    const run = await this.startRun('SCHEDULED', null, true);
    try {
      const { plan, session } = await this.computePlan(configuration);
      const summary = summarizeDirectorySyncPlan(plan);
      if (plan.safeguard.tripped) {
        await this.finishRun(run.id, startedAt, 'ABORTED_SAFEGUARD', { ...summary, url: session.url }, plan, 'DIRECTORY_SAFEGUARD_TRIPPED');
        await this.audit(auditLogActions.directorySyncAborted, run.id, null, { ...plan.safeguard });
        await this.notifySuperAdmins(run.id, plan);
        return 'aborted';
      }
      const result = await this.executePlan(plan);
      await this.finishRun(run.id, startedAt, 'SUCCEEDED', { ...summary, applied: countsOnly(result), url: session.url }, null, null);
      await this.audit(auditLogActions.directorySyncApplied, run.id, null, { ...countsOnly(result), scheduled: true });
      return 'applied';
    } catch (error) {
      await this.failRun(run.id, startedAt, error);
      this.logger.warn(`scheduled directory sync failed: ${errorCodeOf(error)}`);
      return 'skipped';
    } finally {
      await this.pruneOldPlans();
    }
  }

  async listRuns(): Promise<readonly Record<string, unknown>[]> {
    const runs = await this.prisma.directorySyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: directoryFullSyncLimits.historySize,
      select: {
        id: true, kind: true, status: true, source: true, actorUserId: true, startedAt: true,
        finishedAt: true, durationMs: true, summary: true, errorCode: true, appliedByRunId: true,
      },
    });
    const actorIds = [...new Set(runs.map((run) => run.actorUserId).filter((id): id is string => id !== null))];
    const actors = actorIds.length === 0
      ? []
      : await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } });
    const names = new Map(actors.map((actor) => [actor.id, actor.displayName]));
    return runs.map((run) => ({
      ...run,
      actorName: run.actorUserId === null ? null : (names.get(run.actorUserId) ?? null),
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    }));
  }

  async getRunPlan(runId: string): Promise<DirectorySyncPlan> {
    const run = await this.prisma.directorySyncRun.findUnique({ where: { id: runId }, select: { plan: true } });
    if (run?.plan == null) {
      throw new DirectorySyncError('DIRECTORY_PLAN_NOT_FOUND');
    }
    return run.plan as unknown as DirectorySyncPlan;
  }

  backoffStatus(configuration: LdapsSyncConfiguration) {
    return this.backoff.snapshot(configuration.retryBackoffMilliseconds);
  }

  private async computePlan(configuration: LdapsSyncConfiguration) {
    const { result, session } = await withLdapsSession({
      configuration,
      backoff: this.backoff,
      now: Date.now,
      factory: this.clientFactory,
      work: async (reader) => ({
        units: await reader.readOrganizationalUnits(),
        users: await reader.readUsers(),
      }),
    });
    const state = await loadDirectorySyncState(this.prisma, configuration.usersBaseDn);
    const plan = buildDirectorySyncPlan({
      configuration,
      directoryUnits: result.units,
      directoryUsers: result.users,
      existingUnits: state.units,
      existingUsers: state.users,
    });
    return { plan, session };
  }

  private executePlan(plan: DirectorySyncPlan): Promise<DirectorySyncApplyResult> {
    return applyDirectorySyncPlan(
      this.prisma,
      plan,
      {
        invalidateUsers: async (userIds) => this.principalContextInvalidator?.invalidateUsers(userIds),
        revokeSessions: async (userIds) => {
          for (const userId of userIds) {
            await this.sessionRevocationStore?.revokeAllForUser(userId, authenticationConstants.sessionTtlSeconds);
          }
        },
      },
      new Date(),
    );
  }

  private async loadLdaps(): Promise<LdapsSyncConfiguration> {
    const configuration = await this.configurationLoader.load();
    if (configuration.source !== 'ldaps') {
      throw new DirectorySyncError('DIRECTORY_SOURCE_NOT_LDAPS');
    }
    return configuration;
  }

  private async assertCooldown(configuration: LdapsSyncConfiguration): Promise<void> {
    if (configuration.syncCooldownMilliseconds <= 0) return;
    const last = await this.prisma.directorySyncRun.findFirst({
      where: { kind: { in: ['DRY_RUN', 'SCHEDULED'] }, status: { in: ['SUCCEEDED', 'ABORTED_SAFEGUARD'] } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    if (last === null) return;
    const retryAt = last.startedAt.getTime() + configuration.syncCooldownMilliseconds;
    if (Date.now() < retryAt) {
      throw new DirectorySyncError('DIRECTORY_SYNC_COOLDOWN', 'Cooldown', { retryAt: new Date(retryAt).toISOString() });
    }
  }

  private async startRun(kind: RunKind, actorUserId: string | null, exclusive: boolean) {
    if (exclusive) {
      const running = await this.prisma.directorySyncRun.findFirst({
        where: {
          status: 'RUNNING',
          kind: { in: ['DRY_RUN', 'APPLY', 'SCHEDULED'] },
          startedAt: { gt: new Date(Date.now() - directoryFullSyncLimits.runLeaseMilliseconds) },
        },
        select: { id: true },
      });
      if (running !== null) {
        throw new DirectorySyncError('DIRECTORY_SYNC_IN_PROGRESS');
      }
    }
    return this.prisma.directorySyncRun.create({
      data: { kind, status: 'RUNNING', source: 'ldaps', actorUserId },
      select: { id: true },
    });
  }

  private async finishRun(
    runId: string,
    startedAt: number,
    status: 'SUCCEEDED' | 'FAILED' | 'ABORTED_SAFEGUARD',
    summary: Record<string, unknown> | null,
    plan: DirectorySyncPlan | null,
    errorCode: string | null,
  ): Promise<void> {
    await this.prisma.directorySyncRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt,
        summary: (summary ?? undefined) as Prisma.InputJsonValue | undefined,
        plan: (plan ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        errorCode,
      },
    });
  }

  private async failRun(runId: string, startedAt: number, error: unknown): Promise<void> {
    const details = error instanceof DirectorySyncError ? error.details ?? null : null;
    await this.finishRun(
      runId,
      startedAt,
      'FAILED',
      details === null ? null : { ...details },
      null,
      errorCodeOf(error),
    ).catch(() => undefined);
  }

  private async notifySuperAdmins(runId: string, plan: DirectorySyncPlan): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { key: authenticationConstants.superAdminRoleKey } } } },
      select: { id: true },
    });
    for (const admin of admins) {
      await persistInAppNotification(this.prisma, {
        userId: admin.id,
        type: notificationTypes.directorySyncAborted,
        title: 'notifications.items.directorySyncAborted',
        body: `${plan.safeguard.deactivations}/${plan.safeguard.activeManagedUsers}`,
        ticketId: null,
        payload: {
          ticketId: '',
          ticketNumber: '',
          event: notificationTypes.directorySyncAborted,
          messageId: `directory-sync:${runId}`,
          actorUserId: null,
          confidential: false,
        },
        dedupeKey: `directory-sync-aborted:${runId}:${admin.id}`,
      }).catch(() => null);
    }
  }

  private async pruneOldPlans(): Promise<void> {
    const cutoff = new Date(Date.now() - directoryFullSyncLimits.planRetentionDays * 86_400_000);
    await this.prisma
      .$executeRaw`UPDATE "DirectorySyncRun" SET "plan" = NULL WHERE "startedAt" < ${cutoff} AND "plan" IS NOT NULL`
      .catch(() => undefined);
  }

  private async audit(action: string, runId: string, actorUserId: string | null, metadata: Record<string, unknown>) {
    try {
      await recordAuditEntry(this.prisma, {
        action,
        entityType: auditLogEntityTypes.directorySyncRun,
        entityId: runId,
        metadata: metadata as never,
        actorUserId,
      });
    } catch (error) {
      this.logger.warn(`audit write failed for ${action}: ${errorCodeOf(error)}`);
    }
  }
}

function countsOnly(result: DirectorySyncApplyResult): Record<string, number> {
  const { failures, ...counts } = result;
  return { ...counts, failures: failures.length };
}

function errorCodeOf(error: unknown): string {
  if (error instanceof DirectorySyncError) return error.code;
  return (error as { name?: string })?.name ?? 'UNKNOWN';
}
