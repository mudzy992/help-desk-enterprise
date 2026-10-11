import { AUTHORIZATION_REQUIRED_ROLES_KEY } from '../authorization/authorization.constants';
import { SecurityMetricsController } from './security-metrics.controller';

/*
  Paket 5.4.0-e: the admin monitoring graph reads aggregated counters — never a
  person. These tests lock the access model and the `no-store` answer; the
  aggregation itself is covered where it lives
  (`login-security-metrics.service.spec.ts`).
*/
describe('SecurityMetricsController', () => {
  it('is restricted to the SuperAdmin role', () => {
    expect(
      Reflect.getMetadata(AUTHORIZATION_REQUIRED_ROLES_KEY, SecurityMetricsController),
    ).toEqual(['SUPER_ADMIN']);
  });

  it('answers with Cache-Control: no-store', () => {
    const headers = Reflect.getMetadata(
      '__headers__',
      SecurityMetricsController.prototype.lastHour,
    ) as readonly { readonly name: string; readonly value: string }[];
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
  });

  it('returns the snapshot of the last hour unchanged', async () => {
    const snapshot = {
      generatedAt: '2026-10-11T20:00:00.000Z',
      windowSeconds: 3600,
      metrics: {
        'login-429': { total: 3, peakPerMinute: 2, points: [] },
        'login-account-delays': { total: 12, peakPerMinute: 4, points: [] },
        'mfa-failures': { total: 1, peakPerMinute: 1, points: [] },
        'hibp-skipped': { total: 0, peakPerMinute: 0, points: [] },
      },
    };
    const lastHour = jest.fn().mockResolvedValue(snapshot);
    const controller = new SecurityMetricsController({ lastHour } as never);

    await expect(controller.lastHour()).resolves.toBe(snapshot);
    expect(lastHour).toHaveBeenCalledTimes(1);
  });
});
