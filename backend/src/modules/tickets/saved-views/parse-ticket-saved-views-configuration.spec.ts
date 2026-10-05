import { parseTicketSavedViewsConfiguration } from './parse-ticket-saved-views-configuration';

describe('parseTicketSavedViewsConfiguration', () => {
  it('keeps saved views personal (M8 B3: the unused sharing switch is gone)', () => {
    expect(
      parseTicketSavedViewsConfiguration({
        addonEnabled: true,
        enabled: true,
        maxPerUser: 12,
        allowDefaultView: true,
      }),
    ).toEqual({
      enabled: true,
      maxPerUser: 12,
      allowDefaultView: true,
    });
  });
});
