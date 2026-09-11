import { parseTicketSplitConfiguration } from './parse-ticket-split-configuration';

describe('parseTicketSplitConfiguration', () => {
  it('disables split when the addon or setting is off', () => {
    expect(
      parseTicketSplitConfiguration({
        addonEnabled: false,
        enabled: true,
        allowAttachmentMove: false,
        allowMessageCopy: true,
        requireReason: true,
      }).enabled,
    ).toBe(false);
  });

  it('returns the parsed policy when split is enabled', () => {
    expect(
      parseTicketSplitConfiguration({
        addonEnabled: true,
        enabled: true,
        allowAttachmentMove: true,
        allowMessageCopy: false,
        requireReason: false,
      }),
    ).toEqual({
      enabled: true,
      allowAttachmentMove: true,
      allowMessageCopy: false,
      requireReason: false,
    });
  });
});
