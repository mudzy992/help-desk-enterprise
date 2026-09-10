import { ServiceFormsError } from './service-forms.error';
import type { ServiceFormsErrorCode } from './service-forms.error';

export function assertKnownObjectKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: ServiceFormsErrorCode = 'INVALID_FORM_SCHEMA',
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ServiceFormsError(code);
    }
  }
}
