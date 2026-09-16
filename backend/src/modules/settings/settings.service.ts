import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { listSettingsRegistry } from './list-settings-registry';
import { persistSettingValue } from './persist-setting-value';
import { SettingsError } from './settings.error';
import { SETTINGS_REGISTRY } from './settings.registry-token';
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

  private async resolveValue(
    definition: SettingDefinition,
  ): Promise<SettingValue | undefined> {
    const stored = await this.prisma.appSetting.findUnique({
      where: { key: definition.key },
      select: { value: true },
    });
    if (stored === null) {
      const defaultValue = getSettingDefaultValue(definition);
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      if (definition.isRequired) {
        throw new SettingsError(`Required setting is missing: ${definition.key}`);
      }
      return undefined;
    }
    return validateSettingValue(definition, stored.value);
  }
}
