import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { listSettingsRegistry } from './list-settings-registry';
import { persistSettingValue } from './persist-setting-value';
import { SettingsError } from './settings.error';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import {
  readSettingWithSnapshot,
  rememberSettingValue,
} from './settings-snapshot';
import { SettingsRealtimeHub } from './settings-realtime.hub';
import { toSettingsRealtimePayload } from './to-settings-realtime-payload';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from './settings-value';
import type {
  SettingDefinition,
  SettingRegistryEntry,
  SettingsMutationInput,
  SettingsRegistry,
  SettingValue,
} from './settings.types';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
    private readonly prisma: PrismaService,
    @Optional() private readonly settingsRealtimeHub?: SettingsRealtimeHub,
  ) {}

  async listRegistry(): Promise<readonly SettingRegistryEntry[]> {
    return listSettingsRegistry(this.prisma, this.registry);
  }

  async getPublicSettings(): Promise<
    Readonly<Record<string, SettingValue | undefined>>
  > {
    return this.collectByVisibility('public');
  }

  async getPrivateSettings(): Promise<
    Readonly<Record<string, SettingValue | undefined>>
  > {
    return this.collectByVisibility('private');
  }

  async getSetting(key: string): Promise<SettingValue | undefined> {
    const definition = this.registry.requireDefinition(key);
    if (definition.visibility === 'secret') {
      throw new SettingsError(
        `Secret setting ${key} must be read via getSecretForInternalUse`,
      );
    }
    return this.resolveValue(definition);
  }

  async getSecretForInternalUse(key: string): Promise<SettingValue | undefined> {
    const definition = this.registry.requireDefinition(key);
    if (definition.visibility !== 'secret') {
      throw new SettingsError(`Setting ${key} is not classified as secret`);
    }
    return this.resolveValue(definition);
  }

  async hasStoredValue(key: string): Promise<boolean> {
    this.registry.requireDefinition(key);
    const stored = await this.prisma.appSetting.findUnique({
      where: { key },
      select: { key: true },
    });
    return stored !== null;
  }

  async setSettingValue(
    key: string,
    value: SettingValue,
    mutation: SettingsMutationInput,
  ): Promise<void> {
    const definition = this.registry.requireDefinition(key);
    await persistSettingValue(this.prisma, definition, value, mutation);
    // Read-after-write inside the same request must see the new value, not the snapshot
    // that was loaded before it (the install wizard writes a setting and reads it back).
    rememberSettingValue(definition.key, validateSettingValue(definition, value));
    const realtime = toSettingsRealtimePayload(definition);
    if (realtime !== null) {
      this.settingsRealtimeHub?.publish(realtime);
    }
  }

  private async collectByVisibility(
    visibility: 'public' | 'private',
  ): Promise<Readonly<Record<string, SettingValue | undefined>>> {
    const snapshot: Record<string, SettingValue | undefined> = {};
    for (const definition of this.registry.listByVisibility(visibility)) {
      snapshot[definition.key] = await this.resolveValue(definition);
    }
    return snapshot;
  }

  /**
   * Resolves one setting. Inside a request the whole `AppSetting` table is read once and
   * every later key is answered from that snapshot (see `settings-snapshot.ts`); outside
   * a request, and for clients that cannot list rows, this is the original single read.
   */
  private async resolveValue(
    definition: SettingDefinition,
  ): Promise<SettingValue | undefined> {
    const stored = await readSettingWithSnapshot({
      prisma: this.prisma as unknown as Parameters<
        typeof readSettingWithSnapshot
      >[0]['prisma'],
      key: definition.key,
      readOne: () => this.readStoredValue(definition),
    });
    if (stored === null || stored === undefined) {
      const defaultValue = getSettingDefaultValue(definition);
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      if (definition.isRequired) {
        throw new SettingsError(`Required setting is missing: ${definition.key}`);
      }
      return undefined;
    }
    return validateSettingValue(definition, stored);
  }

  private async readStoredValue(
    definition: SettingDefinition,
  ): Promise<unknown> {
    const stored = await this.prisma.appSetting.findUnique({
      where: { key: definition.key },
      select: { value: true },
    });
    return stored?.value ?? null;
  }
}
