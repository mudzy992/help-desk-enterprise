import { isInstallSetupExemptRequest } from './is-install-setup-exempt-request';

describe('isInstallSetupExemptRequest', () => {
  it('allows GET /health and every /install path', () => {
    expect(
      isInstallSetupExemptRequest({ method: 'GET', path: '/health' }),
    ).toBe(true);
    expect(
      isInstallSetupExemptRequest({ method: 'GET', path: '/install' }),
    ).toBe(true);
    expect(
      isInstallSetupExemptRequest({
        method: 'POST',
        path: '/install/status?source=ui',
      }),
    ).toBe(true);
  });

  it('does not exempt protected application routes', () => {
    expect(
      isInstallSetupExemptRequest({ method: 'POST', path: '/auth/login' }),
    ).toBe(false);
    expect(
      isInstallSetupExemptRequest({ method: 'PUT', path: '/settings' }),
    ).toBe(false);
    expect(
      isInstallSetupExemptRequest({ method: 'GET', path: '/installed' }),
    ).toBe(false);
    expect(
      isInstallSetupExemptRequest({ method: 'POST', path: '/health' }),
    ).toBe(false);
  });
});
