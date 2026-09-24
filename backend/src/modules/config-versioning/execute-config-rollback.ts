import { invalidateConfigurationCachesAfter } from '../settings/invalidate-configuration-caches';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireChangeReason } from '../change-log/require-change-reason';
import type { SettingsRegistry } from '../settings/settings.types';
import { SettingsService } from '../settings/settings.service';
import { buildRollbackSnapshot } from './build-rollback-snapshot';
import { collectConfigSnapshot } from './collect-config-snapshot';
import {
  configVersioningErrorCodes,
  configVersioningShadowSampleSize,
} from './config-versioning.constants';
import {
  assertConfigActivationAllowed,
  requireConfigVersionRecord,
  resolveRollbackTarget,
} from './config-versioning-access';
import { ConfigVersioningError } from './config-versioning.error';
import { ConfigVersioningRepository } from './config-versioning.repository';
import type {
  ConfigShadowDiff,
  ConfigVersionResponse,
  ConfigVersioningConfiguration,
} from './config-versioning.types';
import { computeShadowDiff } from './compute-shadow-diff';
import { parseConfigSnapshot } from './parse-config-snapshot';
import { persistActivatedConfigVersion } from './persist-activated-config-version';
import { toConfigVersionDetailResponse } from './to-config-version-response';

export async function executeConfigRollback(input: {
  readonly prisma: PrismaService;
  readonly repository: ConfigVersioningRepository;
  readonly registry: SettingsRegistry;
  readonly configuration: ConfigVersioningConfiguration;
  readonly id: string;
  readonly reason: string | undefined;
  readonly actorUserId: string | null;
  readonly targetVersionId?: string;
}): Promise<ConfigVersionResponse> {
  if (!input.configuration.allowRollback) {
    throw new ConfigVersioningError(configVersioningErrorCodes.rollbackDisabled);
  }
  const normalizedReason = requireChangeReason(input.reason);
  const current = await requireConfigVersionRecord(input.repository, input.id);
  if (current.status !== 'ACTIVE') {
    throw new ConfigVersioningError(configVersioningErrorCodes.notFound);
  }
  const target = await resolveRollbackTarget(
    input.prisma,
    input.repository,
    current,
    input.targetVersionId,
  );
  const snapshot = buildRollbackSnapshot(
    parseConfigSnapshot(target.snapshot),
    target.version,
    new Date().toISOString(),
  );
  assertConfigActivationAllowed(snapshot, input.registry, input.configuration);
  const created = await input.repository.create({
    version: await input.repository.nextVersionNumber(),
    snapshot,
    releaseNotes: `Rollback of version ${current.version} to ${target.version}`,
    createdByUserId: input.actorUserId,
  });
  await invalidateConfigurationCachesAfter(input.prisma.$transaction((transaction) =>
    persistActivatedConfigVersion(transaction, {
      candidate: created,
      snapshot,
      previousActive: current,
      previousStatus: 'ROLLED_BACK',
      reason: normalizedReason,
      actorUserId: input.actorUserId,
      auditAction: 'config_version.rollback',
      registry: input.registry,
    }),
  ));
  const record = await requireConfigVersionRecord(input.repository, created.id);
  return toConfigVersionDetailResponse(record, parseConfigSnapshot(record.snapshot));
}

export async function executeConfigShadow(input: {
  readonly prisma: PrismaService;
  readonly repository: ConfigVersioningRepository;
  readonly settingsService: SettingsService;
  readonly configuration: ConfigVersioningConfiguration;
  readonly id: string;
}): Promise<ConfigShadowDiff> {
  if (!input.configuration.shadowModeEnabled) {
    throw new ConfigVersioningError(configVersioningErrorCodes.shadowDisabled);
  }
  const candidate = parseConfigSnapshot(
    (await requireConfigVersionRecord(input.repository, input.id)).snapshot,
  );
  const active = await input.repository.findActive();
  const baseline =
    active === null
      ? await collectConfigSnapshot(
          input.prisma,
          input.settingsService,
          input.configuration.scopes,
        )
      : parseConfigSnapshot(active.snapshot);
  const tickets = await input.prisma.ticket.findMany({
    orderBy: { createdAt: 'desc' },
    take: configVersioningShadowSampleSize,
    select: { originUnitId: true, serviceId: true, priority: true },
  });
  return computeShadowDiff(baseline, candidate, tickets);
}
