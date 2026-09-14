import { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsRegistry } from '../settings/settings.types';
import { configVersioningErrorCodes } from './config-versioning.constants';
import { ConfigVersioningConfigurationLoader } from './config-versioning-configuration.loader';
import { ConfigVersioningError } from './config-versioning.error';
import { ConfigVersioningRepository } from './config-versioning.repository';
import type {
  ConfigSnapshot,
  ConfigVersioningConfiguration,
} from './config-versioning.types';
import { validateConfigSnapshot } from './validate-config-snapshot';
import type { ConfigVersionRecord } from './to-config-version-response';

export async function requireConfigVersioningEnabled(
  loader: ConfigVersioningConfigurationLoader,
): Promise<ConfigVersioningConfiguration> {
  const configuration = await loader.load();
  if (!configuration.enabled) {
    throw new ConfigVersioningError(configVersioningErrorCodes.disabled);
  }
  return configuration;
}

export async function requireConfigVersionRecord(
  repository: ConfigVersioningRepository,
  id: string,
): Promise<ConfigVersionRecord> {
  const record = await repository.findById(id);
  if (record === null) {
    throw new ConfigVersioningError(configVersioningErrorCodes.notFound);
  }
  return record;
}

export function assertConfigActivationAllowed(
  snapshot: ConfigSnapshot,
  registry: SettingsRegistry,
  configuration: ConfigVersioningConfiguration,
): void {
  const errors = validateConfigSnapshot(snapshot, registry, configuration);
  if (errors.length > 0 && configuration.blockActivationOnError) {
    throw new ConfigVersioningError(
      configVersioningErrorCodes.validationFailed,
      errors,
    );
  }
}

export async function resolveRollbackTarget(
  prisma: PrismaService,
  repository: ConfigVersioningRepository,
  current: ConfigVersionRecord,
  targetVersionId: string | undefined,
): Promise<ConfigVersionRecord> {
  if (targetVersionId !== undefined) {
    const target = await requireConfigVersionRecord(repository, targetVersionId);
    if (target.id === current.id) {
      throw new ConfigVersioningError(configVersioningErrorCodes.alreadyActive);
    }
    return target;
  }
  const previous = await prisma.configVersion.findFirst({
    where: {
      id: { not: current.id },
      activatedAt: { not: null },
      status: { in: ['VALIDATED', 'ROLLED_BACK'] },
    },
    orderBy: { activatedAt: 'desc' },
  });
  if (previous === null) {
    throw new ConfigVersioningError(configVersioningErrorCodes.noPreviousVersion);
  }
  return previous;
}
