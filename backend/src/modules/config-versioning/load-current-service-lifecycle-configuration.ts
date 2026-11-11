import type { Prisma } from "../../generated/prisma/client";
import { ServiceCatalogError } from "../service-catalog/service-catalog.error";
import { parseServiceLifecycleConfiguration } from "../service-catalog/parse-service-lifecycle-configuration";
import type { ServiceLifecycleConfiguration } from "../service-catalog/service-catalog.types";
import { settingKeys } from "../settings/setting-keys";
import type { SettingsRegistry } from "../settings/settings.types";
import { configVersioningErrorCodes } from "./config-versioning.constants";
import { ConfigVersioningError } from "./config-versioning.error";

const lifecycleSettingKeys = [
  settingKeys.privateServicesLifecycleEnabled,
  settingKeys.privateServicesLifecycleAllowedStatesCsv,
  settingKeys.privateServicesLifecycleDefaultStateOnCreate,
] as const;

/**
 * Read the live policy before the candidate snapshot applies its settings. The
 * transition guard must not be weakened by a candidate that disables lifecycle
 * enforcement in the same activation.
 */
export async function loadCurrentServiceLifecycleConfiguration(
  transaction: Prisma.TransactionClient,
  registry: SettingsRegistry,
): Promise<ServiceLifecycleConfiguration> {
  const rows = await transaction.appSetting.findMany({
    where: { key: { in: [...lifecycleSettingKeys] } },
    select: { key: true, value: true },
  });
  const stored = new Map(rows.map((row) => [row.key, row.value] as const));
  const value = (key: (typeof lifecycleSettingKeys)[number]): unknown => {
    if (stored.has(key)) {
      return stored.get(key);
    }
    const definition = registry.getDefinition(key);
    return definition !== undefined && definition.visibility !== "secret"
      ? definition.defaultValue
      : undefined;
  };

  try {
    return parseServiceLifecycleConfiguration({
      enabled: value(settingKeys.privateServicesLifecycleEnabled),
      allowedStatesCsv: value(
        settingKeys.privateServicesLifecycleAllowedStatesCsv,
      ),
      defaultStateOnCreate: value(
        settingKeys.privateServicesLifecycleDefaultStateOnCreate,
      ),
    });
  } catch (error) {
    const code =
      error instanceof ServiceCatalogError
        ? error.code
        : "SERVICE_LIFECYCLE_CONFIGURATION_INVALID";
    throw new ConfigVersioningError(
      configVersioningErrorCodes.catalogInvariantViolation,
      [
        {
          code,
          path: "settings.private.services.lifecycle",
          message: code,
        },
      ],
    );
  }
}
