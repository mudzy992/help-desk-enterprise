import { defaultConfigVersioningScopesCsv } from '../settings/definitions/config-versioning-settings';
import {
  configVersioningErrorCodes,
  configVersioningScopeValues,
} from './config-versioning.constants';
import { ConfigVersioningError } from './config-versioning.error';
import type { ConfigVersioningConfiguration } from './config-versioning.types';

export function parseConfigVersioningConfiguration(input: {
  readonly enabled: unknown;
  readonly allowRollback: unknown;
  readonly validationEnabled: unknown;
  readonly blockActivationOnError: unknown;
  readonly shadowModeEnabled: unknown;
  readonly scopesCsv: unknown;
}): ConfigVersioningConfiguration {
  if (
    typeof input.enabled !== 'boolean' ||
    typeof input.allowRollback !== 'boolean' ||
    typeof input.validationEnabled !== 'boolean' ||
    typeof input.blockActivationOnError !== 'boolean' ||
    typeof input.shadowModeEnabled !== 'boolean' ||
    typeof input.scopesCsv !== 'string'
  ) {
    throw new ConfigVersioningError(configVersioningErrorCodes.disabled);
  }
  return {
    enabled: input.enabled,
    allowRollback: input.allowRollback,
    validationEnabled: input.validationEnabled,
    blockActivationOnError: input.blockActivationOnError,
    shadowModeEnabled: input.shadowModeEnabled,
    scopes: parseScopes(input.scopesCsv),
  };
}

function parseScopes(value: string): readonly string[] {
  const source =
    value.trim().length === 0 ? defaultConfigVersioningScopesCsv : value;
  const scopes = [
    ...new Set(
      source
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0),
    ),
  ];
  const allowed = new Set<string>(configVersioningScopeValues);
  if (scopes.length === 0 || scopes.some((scope) => !allowed.has(scope))) {
    throw new ConfigVersioningError(configVersioningErrorCodes.disabled);
  }
  return scopes;
}
