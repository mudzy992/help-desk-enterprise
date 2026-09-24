import { Test } from '@nestjs/testing';
import { runWithRequestId } from '../../common/request-context/request-context.storage';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';
import {
  maxSettingsSnapshots,
  readSettingWithSnapshot,
  readSettingsSnapshotCount,
  rememberSettingValue,
  resetSettingsSnapshots,
} from './settings-snapshot';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('settings snapshot', () => {
  beforeEach(() => {
    resetSettingsSnapshots();
  });

  function createListingClient(
    rows: readonly { readonly key: string; readonly value: unknown }[],
  ) {
    return {
      findMany: jest.fn().mockResolvedValue(rows),
    };
  }

  it('lists the table once for many keys inside one request', async () => {
    const appSetting = createListingClient([
      { key: 'a', value: 1 },
      { key: 'b', value: 2 },
      { key: 'c', value: 3 },
    ]);
    const readOne = jest.fn();

    const read = (key: string): Promise<unknown> =>
      runWithRequestId('request-1', () =>
        readSettingWithSnapshot({ prisma: { appSetting }, key, readOne }),
      );

    await expect(read('a')).resolves.toBe(1);
    await expect(read('b')).resolves.toBe(2);
    await expect(read('c')).resolves.toBe(3);

    expect(appSetting.findMany).toHaveBeenCalledTimes(1);
    expect(readOne).not.toHaveBeenCalled();
  });

  it('answers a key that is not stored with undefined, not by re-reading', async () => {
    const appSetting = createListingClient([{ key: 'a', value: 1 }]);
    const readOne = jest.fn();

    const value = await runWithRequestId('request-2', () =>
      readSettingWithSnapshot({
        prisma: { appSetting },
        key: 'missing',
        readOne,
      }),
    );

    expect(value).toBeUndefined();
    expect(readOne).not.toHaveBeenCalled();
    expect(appSetting.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps requests separate: two requests cost two listings', async () => {
    const appSetting = createListingClient([{ key: 'a', value: 1 }]);
    const readOne = jest.fn();

    await runWithRequestId('request-3', () =>
      readSettingWithSnapshot({ prisma: { appSetting }, key: 'a', readOne }),
    );
    await runWithRequestId('request-4', () =>
      readSettingWithSnapshot({ prisma: { appSetting }, key: 'a', readOne }),
    );

    expect(appSetting.findMany).toHaveBeenCalledTimes(2);
    expect(readSettingsSnapshotCount()).toBe(2);
  });

  it('falls back to the single read outside a request (worker jobs, boot)', async () => {
    const appSetting = createListingClient([{ key: 'a', value: 1 }]);
    const readOne = jest.fn().mockResolvedValue('from-single-read');

    const value = await readSettingWithSnapshot({
      prisma: { appSetting },
      key: 'a',
      readOne,
    });

    expect(value).toBe('from-single-read');
    expect(appSetting.findMany).not.toHaveBeenCalled();
    expect(readOne).toHaveBeenCalledTimes(1);
  });

  it('falls back when the client cannot list rows (hand-written test delegates)', async () => {
    const appSetting = { findUnique: jest.fn() } as never;
    const readOne = jest.fn().mockResolvedValue('from-single-read');

    await runWithRequestId('request-5', async () => {
      await readSettingWithSnapshot({ prisma: { appSetting }, key: 'a', readOne });
      await readSettingWithSnapshot({ prisma: { appSetting }, key: 'b', readOne });
    });

    expect(readOne).toHaveBeenCalledTimes(2);
  });

  it('falls back when listing throws, so the real error comes from the single read', async () => {
    const appSetting = {
      findMany: jest.fn().mockRejectedValue(new Error('relation does not exist')),
    };
    const readOne = jest.fn().mockResolvedValue('fallback');

    await runWithRequestId('request-6', async () => {
      const first = await readSettingWithSnapshot({
        prisma: { appSetting },
        key: 'a',
        readOne,
      });
      const second = await readSettingWithSnapshot({
        prisma: { appSetting },
        key: 'b',
        readOne,
      });
      expect(first).toBe('fallback');
      expect(second).toBe('fallback');
    });

    // Tried once for the request, not once per key.
    expect(appSetting.findMany).toHaveBeenCalledTimes(1);
    expect(readOne).toHaveBeenCalledTimes(2);
  });

  it('sees a value written during the same request (read-after-write)', async () => {
    const appSetting = createListingClient([{ key: 'a', value: 'old' }]);
    const readOne = jest.fn();

    const read = (key: string): Promise<unknown> =>
      readSettingWithSnapshot({ prisma: { appSetting }, key, readOne });

    await runWithRequestId('request-7', async () => {
      await expect(read('a')).resolves.toBe('old');
      rememberSettingValue('a', 'new');
      await expect(read('a')).resolves.toBe('new');
      // A key written before the first read is served by the listing itself.
      await expect(read('b')).resolves.toBeUndefined();
    });

    expect(appSetting.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not fabricate a partial snapshot when a write happens before the first read', async () => {
    const appSetting = createListingClient([{ key: 'a', value: 'value-after-write' }]);
    const readOne = jest.fn();

    await runWithRequestId('request-8', async () => {
      // No snapshot is loaded yet, so the write is deliberately not stored: a snapshot
      // holding only the written key would report every other key as missing and the
      // caller would silently fall back to defaults instead of the stored values. The
      // next read lists the table and therefore sees the write.
      rememberSettingValue('a', 'written-value');
      await expect(
        readSettingWithSnapshot({ prisma: { appSetting }, key: 'a', readOne }),
      ).resolves.toBe('value-after-write');
    });

    expect(appSetting.findMany).toHaveBeenCalledTimes(1);
  });

  it('stays bounded when requests never release their snapshot', async () => {
    const appSetting = createListingClient([]);
    const total = maxSettingsSnapshots + 25;

    for (let index = 0; index < total; index += 1) {
      await runWithRequestId(`request-${index}`, () =>
        readSettingWithSnapshot({ prisma: { appSetting }, key: 'a', readOne: jest.fn() }),
      );
    }

    expect(readSettingsSnapshotCount()).toBe(maxSettingsSnapshots);
  });
});

describe('SettingsService with the snapshot', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();

  beforeEach(() => {
    resetSettingsSnapshots();
    findMany.mockReset();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  const createService = async (): Promise<SettingsService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(applicationSettings),
        },
        {
          provide: PrismaService,
          useValue: { appSetting: { findMany, findUnique } },
        },
      ],
    }).compile();
    return moduleRef.get(SettingsService);
  };

  it('reads the whole table once for the settings a request asks for', async () => {
    findMany.mockResolvedValue([
      { key: settingKeys.privateAuthMode, value: 'local' },
      { key: settingKeys.publicBrandingAppName, value: 'EP-HelpDesk' },
    ]);
    const service = await createService();

    const values = await runWithRequestId('request-service', async () => [
      await service.getSetting(settingKeys.privateAuthMode),
      await service.getSetting(settingKeys.publicBrandingAppName),
      await service.getSetting(settingKeys.publicMaintenanceEnabled),
    ]);

    expect(values).toEqual(['local', 'EP-HelpDesk', false]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('publishes a write to the same request and leaves other requests untouched', async () => {
    findMany.mockResolvedValue([
      { key: settingKeys.publicMaintenanceEnabled, value: false },
    ]);
    const service = await createService();

    await runWithRequestId('request-write', async () => {
      // First read loads the snapshot, then the write (persistence is out of scope for
      // this fake — the snapshot hook is what is under test) updates it.
      await expect(
        service.getSetting(settingKeys.publicMaintenanceEnabled),
      ).resolves.toBe(false);
      rememberSettingValue(settingKeys.publicMaintenanceEnabled, true);
      await expect(
        service.getSetting(settingKeys.publicMaintenanceEnabled),
      ).resolves.toBe(true);
    });

    await runWithRequestId('request-after-write', async () => {
      await expect(
        service.getSetting(settingKeys.publicMaintenanceEnabled),
      ).resolves.toBe(false);
    });
  });
});
