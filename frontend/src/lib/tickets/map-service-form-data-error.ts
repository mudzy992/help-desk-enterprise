import type { FormFieldError } from '@/lib/tickets/validate-service-form';
import { ApiError } from '@/services/api';

/**
 * Converts the server's value-free `{ fieldId, code }` details to the same
 * message keys used by the create-form's client-side validator.
 */
export function mapServiceFormDataError(
  error: unknown,
): readonly FormFieldError[] | null {
  if (!(error instanceof ApiError) || error.code !== 'FORM_DATA_INVALID') {
    return null;
  }
  const fields = error.details?.fields;
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.flatMap((field): FormFieldError[] => {
    if (
      typeof field !== 'object' ||
      field === null ||
      !('fieldId' in field) ||
      typeof field.fieldId !== 'string' ||
      !('code' in field) ||
      (field.code !== 'REQUIRED' && field.code !== 'INVALID')
    ) {
      return [];
    }
    return [
      {
        fieldId: field.fieldId,
        messageKey:
          field.code === 'REQUIRED'
            ? 'tickets.form.required'
            : 'tickets.form.invalid',
      },
    ];
  });
}
