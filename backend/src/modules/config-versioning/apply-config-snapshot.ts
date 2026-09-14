import type { Prisma } from '../../generated/prisma/client';
import type { SettingsRegistry } from '../settings/settings.types';
import { applyCatalogSnapshot } from './apply-catalog-snapshot';
import { applyRoutingSnapshot } from './apply-routing-snapshot';
import { applySettingsSnapshot } from './apply-settings-snapshot';
import { applySlaSnapshot } from './apply-sla-snapshot';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigSnapshot } from './config-versioning.types';

export async function applyConfigSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
): Promise<void> {
  try {
    await applySettingsSnapshot(transaction, snapshot, registry);
    await applySlaSnapshot(transaction, snapshot);
    await applyCatalogSnapshot(transaction, snapshot);
    await applyRoutingSnapshot(transaction, snapshot);
  } catch (error) {
    if (error instanceof ConfigVersioningError) {
      throw error;
    }
    throw new ConfigVersioningError(configVersioningErrorCodes.applyFailed);
  }
}
