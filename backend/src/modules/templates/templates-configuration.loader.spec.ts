import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { settingKeys } from '../settings/setting-keys';
import {
  readTemplatesConfigurationHealth,
  recordTemplatesConfigurationReadRecovery,
} from './templates-configuration-health';
import { TemplatesConfigurationLoader } from './templates-configuration.loader';
import type { TemplatesConfiguration } from './templates.constants';

jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

const settingValues = new Map<string, unknown>([
  [settingKeys.privateTicketTemplatesEnabled, true],
  [settingKeys.privateTicketPlaybooksEnabled, true],
  [settingKeys.privateTicketPlaybooksAutoAttach, true],
  [settingKeys.privateTicketPlaybooksRequiredStepsOnResolve, 'warn'],
]);

function createSettingsService(values: Map<string, unknown> = settingValues) {
  return {
    getSetting: jest.fn(async (key: string) => values.get(key)),
  };
}

describe('TemplatesConfigurationLoader', () => {
  const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  beforeEach(() => {
    warn.mockClear();
    log.mockClear();
    recordTemplatesConfigurationReadRecovery(new Date('2026-11-04T10:00:00.000Z'));
  });

  afterAll(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  it.each([
    settingKeys.privateTicketTemplatesEnabled,
    settingKeys.privateTicketPlaybooksEnabled,
    settingKeys.privateTicketPlaybooksAutoAttach,
    settingKeys.privateTicketPlaybooksRequiredStepsOnResolve,
  ])('fails closed when the %s setting read fails', async (failedKey) => {
    const currentValues = new Map(settingValues);
    currentValues.set(settingKeys.privateTicketTemplatesEnabled, false);
    currentValues.set(settingKeys.privateTicketPlaybooksEnabled, false);
    currentValues.set(settingKeys.privateTicketPlaybooksAutoAttach, false);
    currentValues.set(settingKeys.privateTicketPlaybooksRequiredStepsOnResolve, 'block');
    const settings = createSettingsService(currentValues);
    settings.getSetting.mockImplementation(async (key) => {
      if (key === failedKey) throw new Error('database unavailable');
      return currentValues.get(key);
    });
    const loader = new TemplatesConfigurationLoader(settings as never);
    const failuresBefore = readTemplatesConfigurationHealth().readFailuresTotal;

    const error = await loader.load().catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'TEMPLATES_CONFIGURATION_UNAVAILABLE',
    });
    expect(settings.getSetting).toHaveBeenCalledTimes(4);
    expect(readTemplatesConfigurationHealth()).toMatchObject({
      status: 'degraded',
      readFailuresTotal: failuresBefore + 1,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `templates_configuration_read_failure_total=${failuresBefore + 1}`,
      ),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('templates_configuration_health=degraded policy=fail_closed'),
    );
  });

  it('does not reuse enabled defaults after a block configuration read fails, then recovers on a fresh read', async () => {
    const currentValues = new Map(settingValues);
    currentValues.set(settingKeys.privateTicketTemplatesEnabled, false);
    currentValues.set(settingKeys.privateTicketPlaybooksEnabled, false);
    currentValues.set(settingKeys.privateTicketPlaybooksAutoAttach, false);
    currentValues.set(settingKeys.privateTicketPlaybooksRequiredStepsOnResolve, 'block');
    const settings = createSettingsService();
    settings.getSetting.mockImplementation(async (key) => currentValues.get(key));
    const loader = new TemplatesConfigurationLoader(settings as never);
    const expectedInitial: TemplatesConfiguration = {
      templatesEnabled: false,
      playbooksEnabled: false,
      autoAttach: false,
      requiredStepsOnResolve: 'block',
    };

    await expect(loader.load()).resolves.toEqual(expectedInitial);

    settings.getSetting.mockImplementation(async (key) => {
      if (key === settingKeys.privateTicketPlaybooksRequiredStepsOnResolve) {
        throw new Error('settings read failed');
      }
      return currentValues.get(key);
    });
    await expect(loader.load()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(readTemplatesConfigurationHealth().status).toBe('degraded');

    currentValues.set(settingKeys.privateTicketPlaybooksRequiredStepsOnResolve, 'off');
    settings.getSetting.mockImplementation(async (key) => currentValues.get(key));
    await expect(loader.load()).resolves.toEqual({
      ...expectedInitial,
      requiredStepsOnResolve: 'off',
    });
    expect(readTemplatesConfigurationHealth()).toMatchObject({
      status: 'ok',
      lastRecoveryAt: expect.any(String),
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('templates_configuration_health=ok templates_configuration_recovered=1'),
    );
  });
});
