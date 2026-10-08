import { Inject, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { listSettingsRegistry } from './list-settings-registry';
import {
  planDependentResets,
  type SettingDependentReset,
} from './plan-dependent-resets';
import {
  createSettingState,
  toInactiveSettingValue,
} from './setting-state';
import {
  persistSettingValue,
  persistSettingValues,
  type PersistSettingValuesOptions,
  type PersistSettingValuesResult,
} from './persist-setting-value';
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
    options: PersistSettingValuesOptions = {},
  ): Promise<PersistSettingValuesResult> {
    const definition = this.registry.requireDefinition(key);
    const result = await persistSettingValue(
      this.prisma,
      this.registry,
      definition,
      value,
      mutation,
      options,
    );
    // Read-after-write inside the same request must see the new value, not the snapshot
    // that was loaded before it (the install wizard writes a setting and reads it back).
    rememberSettingValue(definition.key, validateSettingValue(definition, value));
    const realtime = toSettingsRealtimePayload(definition);
    if (realtime !== null) {
      this.settingsRealtimeHub?.publish(realtime);
    }
    return result;
  }

  /** Paket 4.1: several keys, one reason, one transaction (all-or-nothing). */
  async setSettingValues(
    entries: readonly { readonly key: string; readonly value: SettingValue }[],
    mutation: SettingsMutationInput,
    options: PersistSettingValuesOptions = {},
  ): Promise<PersistSettingValuesResult> {
    const keys = new Set(entries.map((entry) => entry.key));
    if (entries.length === 0 || keys.size !== entries.length) {
      throw new SettingsError('Batch must contain distinct keys');
    }
    const items = entries.map((entry) => ({ definition: this.registry.requireDefinition(entry.key), value: entry.value }));
    const result = await persistSettingValues(
      this.prisma,
      this.registry,
      items,
      mutation,
      options,
    );
    const published = new Set<string>();
    for (const { definition, value } of items) {
      rememberSettingValue(definition.key, validateSettingValue(definition, value));
      const realtime = toSettingsRealtimePayload(definition);
      const signature = realtime === null ? null : JSON.stringify(realtime);
      if (realtime !== null && signature !== null && !published.has(signature)) {
        published.add(signature);
        this.settingsRealtimeHub?.publish(realtime);
      }
    }
    // Dependents that were reset are remembered too, so a read later in the
    // same request sees what the transaction wrote.
    for (const reset of result.resets) {
      const definition = this.registry.requireDefinition(reset.key);
      if (reset.action === 'delete') {
        rememberSettingValue(definition.key, getSettingDefaultValue(definition));
        continue;
      }
      rememberSettingValue(
        definition.key,
        validateSettingValue(definition, reset.value as SettingValue),
      );
    }
    return result;
  }

  /**
   * Paket 5.3.3 (D7): what a screen shows in the confirmation modal before it
   * switches a setting off. Only dependents that are actually active are
   * listed, because only those will be changed.
   */
  async previewDependentResets(
    key: string,
  ): Promise<readonly SettingDependentReset[]> {
    const definition = this.registry.requireDefinition(key);
    const storedRows = await this.prisma.appSetting.findMany({
      select: { key: true, value: true },
    });
    const state = createSettingState({
      registry: this.registry,
      storedByKey: new Map(storedRows.map((row) => [row.key, row.value] as const)),
    });
    const projected = state.withOverrides(
      new Map([
        [
          definition.key,
          { value: toInactiveSettingValue(definition), isPending: true },
        ],
      ]),
    );
    const plans = planDependentResets({
      state: projected,
      parents: [definition.key],
      explicitKeys: new Set([definition.key]),
    });
    return plans.flatMap((plan) =>
      plan.resets.map((reset) => ({ ...reset, causedBy: plan.causedBy })),
    );
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

  /**
   * The value that represents "switched off" for a definition — what the
   * preview projects so it can list the dependents a switch-off would reset.
   */
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
