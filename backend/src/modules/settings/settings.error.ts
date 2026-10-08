import { ChangeLogError } from '../change-log/change-log.error';
import { changeLogErrorCodes } from '../change-log/change-log.constants';

export const settingsErrorCodes = {
  reasonRequired: changeLogErrorCodes.reasonRequired,
  /** Paket 5.3.3 (D6): an active setting would violate its `requires`. */
  dependencyUnmet: 'SETTING_DEPENDENCY_UNMET',
} as const;

export class SettingsError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /** Paket 5.3.3: structured context (blocked keys, missing parents) for the UI. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SettingsError';
  }
}

/**
 * The message names the parent keys because that is what an administrator has
 * to switch on first; the details carry the same information in a shape the
 * screen can turn into links.
 */
export function createDependencyUnmetError(
  violations: readonly {
    readonly key: string;
    readonly missingKeys: readonly string[];
  }[],
): SettingsError {
  const missingKeys = [
    ...new Set(violations.flatMap((violation) => violation.missingKeys)),
  ];
  const blocked = violations.map((violation) => violation.key).join(', ');
  return new SettingsError(
    `Setting dependencies are not met for: ${blocked}. Switch on: ${missingKeys.join(', ')}`,
    settingsErrorCodes.dependencyUnmet,
    {
      violations: violations.map((violation) => ({
        key: violation.key,
        missingKeys: [...violation.missingKeys],
      })),
      keys: missingKeys,
    },
  );
}

export function mapChangeLogErrorToSettingsError(error: unknown): never {
  if (
    error instanceof ChangeLogError &&
    error.code === changeLogErrorCodes.reasonRequired
  ) {
    throw new SettingsError(
      'A reason is required for this settings change',
      settingsErrorCodes.reasonRequired,
    );
  }
  throw error;
}
