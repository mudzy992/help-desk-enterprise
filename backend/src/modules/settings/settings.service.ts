import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsError } from './settings.error';
import { mapVisibilityToPersistence } from './settings.persistence-map';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import {
  getSettingDefaultValue,
  validateSettingValue,
} from './settings-value';
import type {
  SettingDefinition,
  SettingsRegistry,
  SettingValue,
} from './settings.types';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
    private readonly prisma: PrismaService,
  ) {}

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

  async setSettingValue(key: string, value: SettingValue): Promise<void> {
    const definition = this.registry.requireDefinition(key);
    const validated = validateSettingValue(definition, value);
    const persistence = mapVisibilityToPersistence(definition.visibility);
    await this.prisma.appSetting.upsert({
      where: { key: definition.key },
      create: {
        key: definition.key,
        value: validated,
        scope: persistence.scope,
        isSecret: persistence.isSecret,
        description: definition.description,
      },
      update: {
        value: validated,
        scope: persistence.scope,
        isSecret: persistence.isSecret,
        description: definition.description,
      },
    });
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
