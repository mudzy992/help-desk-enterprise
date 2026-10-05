import { installAddonsErrorCodes } from './install-addons.constants';
import { InstallAddonsError } from './install-addons.error';
import { validateInstallAddons } from './validate-install-addons';

describe('validateInstallAddons', () => {
  it('accepts known catalog keys', () => {
    expect(
      validateInstallAddons({
        addons: { approvals: false, email: true, cmdb: true },
      }),
    ).toEqual({
      addons: { approvals: false, email: true, cmdb: true },
    });
  });

  it('rejects unsupported addon keys before persistence', () => {
    expect(() =>
      validateInstallAddons({
        addons: { approvals: true, ticketing: true },
      }),
    ).toThrow(new InstallAddonsError(installAddonsErrorCodes.unsupportedAddon));
  });

  it('rejects non-boolean addon values and non-object payloads', () => {
    expect(() =>
      validateInstallAddons({
        addons: { approvals: 'true' as unknown as boolean },
      }),
    ).toThrow(
      new InstallAddonsError(installAddonsErrorCodes.invalidConfiguration),
    );
    expect(() =>
      validateInstallAddons({
        addons: ['approvals'] as unknown as Record<string, boolean>,
      }),
    ).toThrow(
      new InstallAddonsError(installAddonsErrorCodes.invalidConfiguration),
    );
  });
});
