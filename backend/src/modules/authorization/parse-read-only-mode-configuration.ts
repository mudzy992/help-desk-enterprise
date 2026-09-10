import { parseCsvTokens } from './parse-csv-tokens';
import { readOnlyModeErrorCodes } from './read-only-mode.constants';
import type { ReadOnlyModeConfiguration } from './read-only-mode.types';

export class ReadOnlyModeConfigurationError extends Error {
  readonly code = readOnlyModeErrorCodes.unavailable;

  constructor() {
    super('Read-only mode configuration is unavailable');
    this.name = 'ReadOnlyModeConfigurationError';
  }
}

export function parseReadOnlyModeConfiguration(input: {
  readonly enabled: unknown;
  readonly modulesCsv: unknown;
  readonly activeModulesCsv: unknown;
  readonly bypassRolesCsv: unknown;
}): ReadOnlyModeConfiguration {
  if (typeof input.enabled !== 'boolean') {
    throw new ReadOnlyModeConfigurationError();
  }
  return {
    enabled: input.enabled,
    lockableModuleKeys: parseRequiredCsv(input.modulesCsv),
    activeModuleKeys: parseOptionalCsv(input.activeModulesCsv),
    bypassRoleKeys: parseRequiredCsv(input.bypassRolesCsv),
  };
}

function parseRequiredCsv(value: unknown): readonly string[] {
  if (typeof value !== 'string') {
    throw new ReadOnlyModeConfigurationError();
  }
  return parseCsvTokens(value);
}

function parseOptionalCsv(value: unknown): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return parseRequiredCsv(value);
}
