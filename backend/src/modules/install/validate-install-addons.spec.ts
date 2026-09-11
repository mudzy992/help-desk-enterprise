import { installAddonsErrorCodes } from './install-addons.constants';
import { InstallAddonsError } from './install-addons.error';
import { validateInstallAddons } from './validate-install-addons';

describe('validateInstallAddons', () => {
  it('accepts known catalog keys', () => {
    expect(
      validateInstallAddons({
        addons: { sla: false, email: true, autoAssign: true },
      }),
    ).toEqual({
      addons: { sla: false, email: true, autoAssign: true },
    });
  });

  it('rejects unsupported addon keys before persistence', () => {
    expect(() =>
      validateInstallAddons({
        addons: { sla: true, ticketing: true },
      }),
    ).toThrow(new InstallAddonsError(installAddonsErrorCodes.unsupportedAddon));
  });

  it('rejects non-boolean addon values and non-object payloads', () => {
    expect(() =>
      validateInstallAddons({
        addons: { sla: 'true' as unknown as boolean },
      }),
    ).toThrow(
      new InstallAddonsError(installAddonsErrorCodes.invalidConfiguration),
    );
    expect(() =>
      validateInstallAddons({
        addons: ['sla'] as unknown as Record<string, boolean>,
      }),
    ).toThrow(
      new InstallAddonsError(installAddonsErrorCodes.invalidConfiguration),
    );
  });
});
