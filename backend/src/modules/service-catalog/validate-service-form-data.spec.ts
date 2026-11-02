import type { ServiceFormSchema } from './form-schema.types';
import { serviceFormRegexSafetyConstants } from './form-schema.constants';
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
      validateServiceFormData(schema, { email: 'updated@example.org' }, { partial: true }),
    ).toEqual([]);
    expect(validateServiceFormData(schema, { hostname: null }, { partial: true })).toEqual([
      { fieldId: 'hostname', code: 'REQUIRED' },
    ]);
    expect(validateServiceFormData(schema, { unknown: true }, { partial: true })).toEqual([
      { fieldId: 'unknown', code: 'INVALID' },
    ]);
  });

  it('rejects any supplied key when there is no schema', () => {
    expect(validateServiceFormData(null, {})).toEqual([]);
    expect(validateServiceFormData(null, { stray: 'value' })).toEqual([
      { fieldId: 'stray', code: 'INVALID' },
    ]);
  });

  it('fails closed on a ReDoS pattern within the byte cap under a 1 second budget', () => {
    const attackSchema: ServiceFormSchema = {
      schemaVersion: 1,
      fields: [
        {
          id: 'payload',
          label: 'Payload',
          type: 'text',
          required: true,
          order: 0,
          validation: { pattern: '^(a+)+$' },
        },
      ],
    };
    const attack = `${'a'.repeat(serviceFormRegexSafetyConstants.maximumInputBytes - 1)}!`;
    const matcherSpy = jest.spyOn(RegExp.prototype, 'test');
    const startedAt = performance.now();
    let result: ReturnType<typeof validateServiceFormData>;
    let matcherCalls = 0;
    try {
      result = validateServiceFormData(attackSchema, { payload: attack });
      matcherCalls = matcherSpy.mock.calls.length;
    } finally {
      matcherSpy.mockRestore();
    }

    expect(result!).toEqual([{ fieldId: 'payload', code: 'INVALID' }]);
    expect(matcherCalls).toBe(0);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it('enforces the UTF-8 byte cap before matching and permits exactly-cap multibyte input', () => {
    const patternSchema: ServiceFormSchema = {
      schemaVersion: 1,
      fields: [
        {
          id: 'label',
          label: 'Label',
          type: 'text',
          required: true,
          order: 0,
          validation: { pattern: '^é+$' },
        },
      ],
    };
    const oversized = 'é'.repeat(2049);
    const matcherSpy = jest.spyOn(RegExp.prototype, 'test');
    let oversizedResult: ReturnType<typeof validateServiceFormData>;
    let matcherCalls = 0;
    try {
      oversizedResult = validateServiceFormData(patternSchema, { label: oversized });
      matcherCalls = matcherSpy.mock.calls.length;
    } finally {
      matcherSpy.mockRestore();
    }
    expect(oversizedResult!).toEqual([{ fieldId: 'label', code: 'INVALID' }]);
    expect(matcherCalls).toBe(0);
    expect(validateServiceFormData(patternSchema, { label: 'é'.repeat(2048) })).toEqual([]);
  });

  it('caps aggregate regex input before evaluating any field pattern', () => {
    const patternFields = Array.from({ length: 5 }, (_, order) => ({
      id: `field_${order}`,
      label: `Field ${order}`,
      type: 'text' as const,
      required: true,
      order,
      validation: { pattern: '^a+$' },
    }));
    const aggregateSchema: ServiceFormSchema = { schemaVersion: 1, fields: patternFields };
    const data = Object.fromEntries(
      patternFields.map((field) => [
        field.id,
        'a'.repeat(serviceFormRegexSafetyConstants.maximumInputBytes),
      ]),
    );
    const matcherSpy = jest.spyOn(RegExp.prototype, 'test');
    let result: ReturnType<typeof validateServiceFormData>;
    let matcherCalls = 0;
    try {
      result = validateServiceFormData(aggregateSchema, data);
      matcherCalls = matcherSpy.mock.calls.length;
    } finally {
      matcherSpy.mockRestore();
    }
    expect(result!).toHaveLength(5);
    expect(result!.every((error) => error.code === 'INVALID')).toBe(true);
    expect(matcherCalls).toBe(0);
  });
});
