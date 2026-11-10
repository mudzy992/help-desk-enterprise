import { ServiceFormsError } from './service-forms.error';
import {
  parseConfiguredFormSchema,
  parseConfiguredLegacyFormSchema,
} from './parse-configured-form-schema';
import { parseFormSchema } from './parse-form-schema';
import type { ServiceFormsConfiguration } from './service-forms.types';

const configuration: ServiceFormsConfiguration = {
  enabled: true,
  requireStructuredFields: false,
  versioningEnabled: true,
  allowMultipleActiveVersions: false,
  requireVersionOnTicket: false,
};

function schemaWithPattern(pattern: string) {
  return {
    schemaVersion: 1,
    fields: [
      {
        id: 'request_code',
        label: 'Request code',
        type: 'text',
        required: true,
        order: 0,
        validation: { pattern },
      },
    ],
  };
}

describe('parseConfiguredFormSchema regex safety enforcement', () => {
  it('accepts bounded safe patterns for new and updated schemas', () => {
    expect(parseConfiguredFormSchema(schemaWithPattern('^[a-z0-9-]+$'), configuration)).toEqual(
      schemaWithPattern('^[a-z0-9-]+$'),
    );
  });

  it('rejects patterns outside the safe subset before they can be persisted', () => {
    expect(() => parseConfiguredFormSchema(schemaWithPattern('^(a+)+$'), configuration)).toThrow(
      new ServiceFormsError('UNSAFE_FORM_PATTERN'),
    );
  });

  it('keeps legacy reads separate from write enforcement', () => {
    expect(parseFormSchema(schemaWithPattern('^(a+)+$')).fields[0]?.validation?.pattern).toBe(
      '^(a+)+$',
    );
    expect(
      parseConfiguredLegacyFormSchema(schemaWithPattern('^(a+)+$'), configuration).fields[0]
        ?.validation?.pattern,
    ).toBe('^(a+)+$');
  });
});
