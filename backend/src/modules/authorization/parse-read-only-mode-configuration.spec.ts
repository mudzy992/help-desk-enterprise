import { authorizationRoleKeys } from './authorization.constants';
import {
  defaultAdminReadOnlyLockableModulesCsv,
} from './read-only-mode.constants';
import { parseCsvTokens } from './parse-csv-tokens';
import {
  parseReadOnlyModeConfiguration,
  ReadOnlyModeConfigurationError,
} from './parse-read-only-mode-configuration';

describe('parseReadOnlyModeConfiguration', () => {
  it('parses enabled mode with lockable and active modules', () => {
    expect(
      parseReadOnlyModeConfiguration({
        enabled: true,
        modulesCsv: defaultAdminReadOnlyLockableModulesCsv,
        activeModulesCsv: 'admin, settings',
        bypassRolesCsv: authorizationRoleKeys.superAdmin,
      }),
    ).toEqual({
      enabled: true,
      lockableModuleKeys: parseCsvTokens(defaultAdminReadOnlyLockableModulesCsv),
      activeModuleKeys: ['admin', 'settings'],
      bypassRoleKeys: [authorizationRoleKeys.superAdmin],
    });
  });

  it('parses disabled mode and empty active modules', () => {
    expect(
      parseReadOnlyModeConfiguration({
        enabled: false,
        modulesCsv: defaultAdminReadOnlyLockableModulesCsv,
        activeModulesCsv: '',
        bypassRolesCsv: authorizationRoleKeys.superAdmin,
      }),
    ).toEqual({
      enabled: false,
      lockableModuleKeys: parseCsvTokens(defaultAdminReadOnlyLockableModulesCsv),
      activeModuleKeys: [],
      bypassRoleKeys: [authorizationRoleKeys.superAdmin],
    });
  });

  it('rejects non-boolean enabled values', () => {
    expect(() =>
      parseReadOnlyModeConfiguration({
        enabled: 'true',
        modulesCsv: defaultAdminReadOnlyLockableModulesCsv,
        activeModulesCsv: '',
        bypassRolesCsv: authorizationRoleKeys.superAdmin,
      }),
    ).toThrow(ReadOnlyModeConfigurationError);
  });
});
