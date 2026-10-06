import { describe, expect, it } from 'vitest';
import { mapServiceFormDataError } from '@/lib/tickets/map-service-form-data-error';
import { ApiError } from '@/services/api';

describe('mapServiceFormDataError', () => {
  it('maps REQUIRED and INVALID codes to the existing form message keys', () => {
    expect(
      mapServiceFormDataError(
        new ApiError(400, 'FORM_DATA_INVALID', 'invalid', null, {
          fields: [
            { fieldId: 'hostname', code: 'REQUIRED' },
            { fieldId: 'serial', code: 'INVALID' },
            { fieldId: 42, code: 'INVALID' },
          ],
        }),
      ),
    ).toEqual([
      { fieldId: 'hostname', messageKey: 'tickets.form.required' },
      { fieldId: 'serial', messageKey: 'tickets.form.invalid' },
    ]);
  });

  it('returns null for other errors and an empty list for malformed details', () => {
    expect(mapServiceFormDataError(new ApiError(400, 'INVALID_TITLE', 'invalid'))).toBeNull();
    expect(mapServiceFormDataError(new ApiError(400, 'FORM_DATA_INVALID', 'invalid'))).toEqual([]);
  });
});
