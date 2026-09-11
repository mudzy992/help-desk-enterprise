import { parseTicketSavedViewsConfiguration } from './parse-ticket-saved-views-configuration';

describe('parseTicketSavedViewsConfiguration', () => {
  it('keeps saved views personal even when sharing is stored on', () => {
    expect(
      parseTicketSavedViewsConfiguration({
        addonEnabled: true,
        enabled: true,
        maxPerUser: 12,
        allowDefaultView: true,
        allowSharing: true,
      }),
    ).toEqual({
      enabled: true,
      maxPerUser: 12,
      allowDefaultView: true,
      allowSharing: false,
    });
  });
});
