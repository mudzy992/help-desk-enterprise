import { settingKeys } from '../../settings/setting-keys';
import { TicketPriorityMatrixConfigurationLoader } from './ticket-priority-matrix-configuration.loader';

function createLoader(value: unknown) {
  const getSetting = jest.fn(async () => value);
  const loader = new TicketPriorityMatrixConfigurationLoader({
    getSetting,
  } as never);
  return { loader, getSetting };
}

describe('TicketPriorityMatrixConfigurationLoader (M7 B5)', () => {
  it('reads the setting and reports it as enabled', async () => {
    const { loader, getSetting } = createLoader(true);
    await expect(loader.load()).resolves.toEqual({ enabled: true });
    expect(getSetting).toHaveBeenCalledWith(
      settingKeys.privateTicketPriorityMatrixEnabled,
    );
  });

  it('reports the switch as off when the administrator turned it off', async () => {
    const { loader } = createLoader(false);
    await expect(loader.load()).resolves.toEqual({ enabled: false });
  });

  it('defaults to on when the setting is missing (null/undefined)', async () => {
    await expect(createLoader(null).loader.load()).resolves.toEqual({
      enabled: true,
    });
    await expect(createLoader(undefined).loader.load()).resolves.toEqual({
      enabled: true,
    });
  });

  it('defaults to on when the settings service throws', async () => {
    const loader = new TicketPriorityMatrixConfigurationLoader({
      getSetting: jest.fn(async () => {
        throw new Error('settings unavailable');
      }),
    } as never);
    await expect(loader.load()).resolves.toEqual({ enabled: true });
  });
});
