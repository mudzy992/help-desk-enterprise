import type { SettingVisibility } from './settings.types';

export const redactedSecretPlaceholder = '[REDACTED]';

export function redactIfSecret(
  visibility: SettingVisibility,
  value: unknown,
): unknown {
  if (visibility === 'secret') {
    return redactedSecretPlaceholder;
  }
  return value;
}
