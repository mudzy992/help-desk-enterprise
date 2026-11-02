import { Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { SettingsRegistry } from '../settings/settings.types';
import { getRequestId } from '../../common/request-context/request-context.storage';
import {
  applyCatalogSnapshot,
  assertCatalogSnapshotCurrent,
} from './apply-catalog-snapshot';
import { loadCurrentServiceLifecycleConfiguration } from './load-current-service-lifecycle-configuration';
import { applyRoutingSnapshot } from './apply-routing-snapshot';
import { applySettingsSnapshot } from './apply-settings-snapshot';
import { applySlaSnapshot } from './apply-sla-snapshot';
import { applyTemplatesSnapshot } from './apply-templates-snapshot';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';
import { validateMandatoryConfigSnapshot } from './validate-config-snapshot';

const logger = new Logger('ConfigVersionApply');

export async function applyConfigSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
): Promise<ConfigSnapshot> {
  const mandatoryIssues = validateMandatoryConfigSnapshot(snapshot);
  if (mandatoryIssues.length > 0) {
    throw new ConfigVersioningError(
      configVersioningErrorCodes.validationFailed,
      mandatoryIssues,
    );
  }
  const currentLifecycleConfiguration =
    await loadCurrentServiceLifecycleConfiguration(transaction, registry);
  await assertCatalogSnapshotCurrent(transaction, snapshot);
  await applyPhase('settings', () => applySettingsSnapshot(transaction, snapshot, registry));
  await applyPhase('sla', () => applySlaSnapshot(transaction, snapshot));
  const appliedCatalog = await applyPhase('catalog', () =>
    applyCatalogSnapshot(transaction, snapshot, currentLifecycleConfiguration),
  );
  await applyPhase('routing', () => applyRoutingSnapshot(transaction, snapshot));
  await applyPhase('templates', () => applyTemplatesSnapshot(transaction, snapshot));
  return { ...snapshot, ...appliedCatalog };
}

async function applyPhase<T>(
  phase: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const requestId = getRequestId() ?? 'unavailable';
    const detail = error instanceof Error
      ? (error.stack ?? error.message)
      : String(error);
    logger.error(
      `requestId=${requestId} config_version_apply_failed phase=${phase}`,
      detail,
    );
    if (error instanceof ConfigVersioningError) {
      throw error;
    }
    throw new ConfigVersioningError(configVersioningErrorCodes.applyFailed);
  }
}
