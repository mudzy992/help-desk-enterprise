import { parseTicketCsatConfiguration } from './parse-ticket-csat-configuration';

describe('parseTicketCsatConfiguration', () => {
  const valid = {
    addonEnabled: true,
    enabled: true,
    scaleMax: 5,
    askOnResolved: true,
    askOnClosed: false,
    samplingRate: 1,
  };

  it('disables when the addon or setting is off', () => {
    expect(
      parseTicketCsatConfiguration({ ...valid, addonEnabled: false }).enabled,
    ).toBe(false);
    expect(parseTicketCsatConfiguration({ ...valid, enabled: false }).enabled).toBe(
      false,
    );
  });

  it('parses a valid enabled configuration', () => {
    expect(parseTicketCsatConfiguration(valid)).toEqual({
      enabled: true,
      scaleMax: 5,
      askOnResolved: true,
      askOnClosed: false,
      samplingRate: 1,
    });
  });

  it('rejects invalid scale or sampling values', () => {
    expect(() =>
      parseTicketCsatConfiguration({ ...valid, scaleMax: 1 }),
    ).toThrow();
    expect(() =>
      parseTicketCsatConfiguration({ ...valid, samplingRate: 1.5 }),
    ).toThrow();
  });
});
