import { parseReportTrendsConfiguration } from './report-trends-configuration.loader';

/**
 * M9/B3 (drugi dio): trends used a hard-coded CSAT scale (5) and threshold (4),
 * so a non-default `private.csat.scaleMax` only changed the CSAT tab. The parser
 * now takes the same setting; an invalid value falls back to 5 (same rules as
 * `parseCsatScaleMax` in `reports/parse-reports-configuration.ts`).
 */
const validRaw = {
  enabled: true,
  maxMonths: 36,
  cacheSeconds: 600,
  slaTargetPercent: 90,
  csatMinSample: 5,
  timeZone: 'Europe/Sarajevo',
} as const;

describe('parseReportTrendsConfiguration — CSAT scale', () => {
  it('keeps a valid scale from the setting', () => {
    expect(
      parseReportTrendsConfiguration({ ...validRaw, csatScaleMax: 10 }).csatScaleMax,
    ).toBe(10);
  });

  it('falls back to 5 for a missing or out-of-range scale', () => {
    expect(parseReportTrendsConfiguration(validRaw).csatScaleMax).toBe(5);
    expect(
      parseReportTrendsConfiguration({ ...validRaw, csatScaleMax: 11 }).csatScaleMax,
    ).toBe(5);
    expect(
      parseReportTrendsConfiguration({ ...validRaw, csatScaleMax: 4.5 }).csatScaleMax,
    ).toBe(5);
    expect(
      parseReportTrendsConfiguration({ ...validRaw, csatScaleMax: '10' }).csatScaleMax,
    ).toBe(5);
  });

  it('keeps the other trends settings untouched', () => {
    const configuration = parseReportTrendsConfiguration({
      ...validRaw,
      csatScaleMax: 2,
      csatMinSample: 50,
    });
    expect(configuration).toMatchObject({
      enabled: true,
      maxMonths: 36,
      cacheSeconds: 600,
      slaTargetPercent: 90,
      csatMinSample: 50,
      csatScaleMax: 2,
      timeZone: 'Europe/Sarajevo',
    });
  });
});
