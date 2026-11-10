import { Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { SettingsRegistry } from '../settings/settings.types';
import { getRequestId } from '../../common/request-context/request-context.storage';
import { applyCatalogSnapshot } from './apply-catalog-snapshot';
import { applyRoutingSnapshot } from './apply-routing-snapshot';
import { applySettingsSnapshot } from './apply-settings-snapshot';
import { applySlaSnapshot } from './apply-sla-snapshot';
import { applyTemplatesSnapshot } from './apply-templates-snapshot';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';

const logger = new Logger('ConfigVersionApply');

export async function applyConfigSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
): Promise<void> {
  await applyPhase('settings', () => applySettingsSnapshot(transaction, snapshot, registry));
  await applyPhase('sla', () => applySlaSnapshot(transaction, snapshot));
  await applyPhase('catalog', () => applyCatalogSnapshot(transaction, snapshot));
  await applyPhase('routing', () => applyRoutingSnapshot(transaction, snapshot));
  await applyPhase('templates', () => applyTemplatesSnapshot(transaction, snapshot));
}

async function applyPhase(
  phase: string,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
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
