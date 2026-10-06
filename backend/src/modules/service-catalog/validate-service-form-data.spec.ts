import type { ServiceFormSchema } from './form-schema.types';
import { validateServiceFormData } from './validate-service-form-data';

const schema: ServiceFormSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'hostname',
      label: 'Hostname',
      type: 'text',
      required: true,
      order: 0,
      validation: { minLength: 3, maxLength: 24, pattern: '^[a-z0-9-]+$' },
    },
    {
      id: 'email',
      label: 'Email',
      type: 'email',
      required: false,
      order: 1,
      validation: { maxLength: 64 },
    },
    {
      id: 'quantity',
      label: 'Quantity',
      type: 'number',
      required: true,
      order: 2,
      validation: { integer: true, min: 1, max: 10 },
    },
    {
      id: 'urgent',
      label: 'Urgent',
      type: 'boolean',
      required: true,
      order: 3,
    },
    {
      id: 'systems',
      label: 'Systems',
      type: 'multiselect',
      required: false,
      order: 4,
      validation: { minItems: 1, maxItems: 2 },
    },
  ],
};

describe('validateServiceFormData', () => {
  it('accepts the frontend field semantics, including false and numeric strings', () => {
    expect(
      validateServiceFormData(schema, {
        hostname: 'pc-001',
        email: 'help@example.org',
        quantity: '2',
        urgent: false,
        systems: ['mail'],
      }),
    ).toEqual([]);
  });

  it('returns REQUIRED and INVALID by field without returning submitted values', () => {
    expect(
      validateServiceFormData(schema, {
        hostname: 'x!',
        email: 'not-an-email',
        quantity: '1.5',
        urgent: 'false',
        systems: ['one', 'two', 'three'],
      }),
    ).toEqual([
      { fieldId: 'hostname', code: 'INVALID' },
      { fieldId: 'email', code: 'INVALID' },
      { fieldId: 'quantity', code: 'INVALID' },
      { fieldId: 'urgent', code: 'INVALID' },
      { fieldId: 'systems', code: 'INVALID' },
    ]);
    expect(validateServiceFormData(schema, {})).toEqual([
      { fieldId: 'hostname', code: 'REQUIRED' },
      { fieldId: 'quantity', code: 'REQUIRED' },
      { fieldId: 'urgent', code: 'REQUIRED' },
    ]);
  });

  it('rejects unknown keys and malformed top-level data', () => {
    expect(validateServiceFormData(schema, { hostname: 'pc-001', custom: 'hidden' })).toEqual([
      { fieldId: 'custom', code: 'INVALID' },
      { fieldId: 'quantity', code: 'REQUIRED' },
      { fieldId: 'urgent', code: 'REQUIRED' },
    ]);
    expect(validateServiceFormData(schema, ['not', 'an', 'object'])).toEqual([
      { fieldId: 'formData', code: 'INVALID' },
    ]);
  });

  it('validates only sent fields for a partial update but checks fields being cleared', () => {
    expect(
      validateServiceFormData(
        schema,
        { email: 'updated@example.org' },
        { partial: true },
      ),
    ).toEqual([]);
    expect(
      validateServiceFormData(schema, { hostname: null }, { partial: true }),
    ).toEqual([{ fieldId: 'hostname', code: 'REQUIRED' }]);
    expect(
      validateServiceFormData(schema, { unknown: true }, { partial: true }),
    ).toEqual([{ fieldId: 'unknown', code: 'INVALID' }]);
  });

  it('rejects any supplied key when there is no schema', () => {
    expect(validateServiceFormData(null, {})).toEqual([]);
    expect(validateServiceFormData(null, { stray: 'value' })).toEqual([
      { fieldId: 'stray', code: 'INVALID' },
    ]);
  });
});
