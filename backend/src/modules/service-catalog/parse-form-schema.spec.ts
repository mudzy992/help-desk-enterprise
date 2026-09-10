import { parseFormSchema } from './parse-form-schema';
import { ServiceFormsError } from './service-forms.error';

const validSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'asset_tag',
      label: 'Asset tag',
      type: 'text',
      required: true,
      order: 0,
      validation: { minLength: 1, maxLength: 64 },
    },
    {
      id: 'priority_reason',
      label: 'Priority reason',
      type: 'select',
      required: false,
      order: 1,
      validation: {
        options: [
          { value: 'outage', label: 'Outage' },
          { value: 'access', label: 'Access' },
        ],
      },
      config: { helpText: 'Why this request is urgent' },
    },
  ],
};

describe('parseFormSchema', () => {
  it('accepts a valid provider-neutral schema', () => {
    expect(parseFormSchema(validSchema)).toEqual(validSchema);
  });

  it('rejects malformed schemas', () => {
    expect(() => parseFormSchema(null)).toThrow(
      new ServiceFormsError('INVALID_FORM_SCHEMA'),
    );
    expect(() => parseFormSchema({ schemaVersion: 2, fields: [] })).toThrow(
      new ServiceFormsError('INVALID_FORM_SCHEMA'),
    );
    expect(() =>
      parseFormSchema({ schemaVersion: 1, fields: 'nope' }),
    ).toThrow(new ServiceFormsError('INVALID_FORM_SCHEMA'));
  });

  it('rejects duplicate field identifiers', () => {
    expect(() =>
      parseFormSchema({
        schemaVersion: 1,
        fields: [
          { id: 'asset_tag', label: 'A', type: 'text', required: true, order: 0 },
          { id: 'asset_tag', label: 'B', type: 'text', required: false, order: 1 },
        ],
      }),
    ).toThrow(new ServiceFormsError('DUPLICATE_FIELD_IDENTIFIER'));
  });

  it('rejects invalid field identifiers', () => {
    expect(() =>
      parseFormSchema({
        schemaVersion: 1,
        fields: [
          { id: 'Asset-Tag', label: 'A', type: 'text', required: true, order: 0 },
        ],
      }),
    ).toThrow(new ServiceFormsError('INVALID_FIELD_IDENTIFIER'));
  });

  it('rejects invalid field configuration', () => {
    expect(() =>
      parseFormSchema({
        schemaVersion: 1,
        fields: [
          { id: 'choice', label: 'Choice', type: 'select', required: true, order: 0 },
        ],
      }),
    ).toThrow(new ServiceFormsError('INVALID_FIELD_CONFIGURATION'));
    expect(() =>
      parseFormSchema({
        schemaVersion: 1,
        fields: [
          {
            id: 'count',
            label: 'Count',
            type: 'number',
            required: true,
            order: 0,
            validation: { min: 10, max: 1 },
          },
        ],
      }),
    ).toThrow(new ServiceFormsError('INVALID_FIELD_CONFIGURATION'));
  });
});
