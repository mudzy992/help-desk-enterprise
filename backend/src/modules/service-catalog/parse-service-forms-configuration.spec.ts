import { parseServiceFormsConfiguration } from './parse-service-forms-configuration';
import { ServiceFormsError } from './service-forms.error';

describe('parseServiceFormsConfiguration', () => {
  it('parses the default flags', () => {
    expect(
      parseServiceFormsConfiguration({
        enabled: true,
        requireStructuredFields: true,
        versioningEnabled: true,
        allowMultipleActiveVersions: false,
        requireVersionOnTicket: true,
      }),
    ).toEqual({
      enabled: true,
      requireStructuredFields: true,
      versioningEnabled: true,
      allowMultipleActiveVersions: false,
      requireVersionOnTicket: true,
    });
  });

  it('rejects malformed configuration', () => {
    expect(() =>
      parseServiceFormsConfiguration({
        enabled: 'yes',
        requireStructuredFields: true,
        versioningEnabled: true,
        allowMultipleActiveVersions: false,
        requireVersionOnTicket: true,
      }),
    ).toThrow(new ServiceFormsError('FORMS_UNAVAILABLE'));
  });
});
