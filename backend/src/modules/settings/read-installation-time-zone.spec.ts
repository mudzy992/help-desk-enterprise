import {
  defaultReportsTimeZone,
} from './definitions/reports-settings';
import {
  normalizeTimeZone,
  readInstallationTimeZone,
} from './read-installation-time-zone';
import type { SettingsService } from './settings.service';

function createSettings(value: unknown, onRead?: () => void) {
  return {
    getSetting: async () => {
      onRead?.();
      return value;
    },
  } as unknown as SettingsService;
}

describe('readInstallationTimeZone', () => {
  it('reads the configured zone', async () => {
    await expect(
      readInstallationTimeZone(createSettings('America/New_York')),
    ).resolves.toBe('America/New_York');
  });

  it('trims the stored value', async () => {
    await expect(
      readInstallationTimeZone(createSettings('  Asia/Kolkata  ')),
    ).resolves.toBe('Asia/Kolkata');
  });

  it('falls back to the installation default when nothing is stored', async () => {
    await expect(readInstallationTimeZone(createSettings(undefined))).resolves.toBe(
      defaultReportsTimeZone,
    );
  });

  it('falls back when the stored value is not a zone name', async () => {
    await expect(readInstallationTimeZone(createSettings('Mars/Olympus'))).resolves.toBe(
      defaultReportsTimeZone,
    );
    await expect(readInstallationTimeZone(createSettings('  '))).resolves.toBe(
      defaultReportsTimeZone,
    );
    await expect(readInstallationTimeZone(createSettings(42))).resolves.toBe(
      defaultReportsTimeZone,
    );
  });

  it('falls back when the settings read itself fails', async () => {
    const broken = {
      getSetting: async () => {
        throw new Error('redis is down');
      },
    } as unknown as SettingsService;
    await expect(readInstallationTimeZone(broken)).resolves.toBe(
      defaultReportsTimeZone,
    );
  });

  it('falls back when the settings service is not part of the graph', async () => {
    await expect(readInstallationTimeZone(undefined)).resolves.toBe(
      defaultReportsTimeZone,
    );
    await expect(readInstallationTimeZone(null as never)).resolves.toBe(
      defaultReportsTimeZone,
    );
  });
});

describe('normalizeTimeZone', () => {
  it('keeps a valid zone and replaces everything else', () => {
    expect(normalizeTimeZone('UTC')).toBe('UTC');
    expect(normalizeTimeZone(' Europe/Sarajevo ')).toBe('Europe/Sarajevo');
    expect(normalizeTimeZone('not a zone')).toBe(defaultReportsTimeZone);
    expect(normalizeTimeZone(null)).toBe(defaultReportsTimeZone);
    expect(normalizeTimeZone('')).toBe(defaultReportsTimeZone);
  });
});
