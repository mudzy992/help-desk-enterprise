import type { ServiceFormSchema } from './form-schema.types';
import { classifyServiceFormPattern } from './service-form-pattern-safety';
import { ServiceFormsError } from './service-forms.error';

export function assertServiceFormPatternsSafe(schema: ServiceFormSchema): void {
  for (const field of schema.fields) {
    const pattern = field.validation?.pattern;
    if (pattern !== undefined && !classifyServiceFormPattern(pattern).safe) {
      throw new ServiceFormsError('UNSAFE_FORM_PATTERN');
    }
  }
}
