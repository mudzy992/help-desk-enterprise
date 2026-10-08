import type { SettingCategoryId } from './setting-categories';

export type SettingVisibility = 'public' | 'private' | 'secret';

export type SettingValueTypeName = 'string' | 'number' | 'boolean';

export type SettingValue = string | number | boolean;

/**
 * Paket 5.3.3 (D6): a condition another setting has to satisfy before this one
 * may be *active*. `equals`/`oneOf` compare the effective value (stored value,
 * otherwise the default), `isSet` asks whether a stored row exists (the only
 * question that can be asked about a secret, which has no readable value), and
 * `notEmpty` asks for a value that is actually filled in.
 */
export type SettingCondition =
  | { readonly key: string; readonly equals: SettingValue }
  | { readonly key: string; readonly oneOf: readonly SettingValue[] }
  | { readonly key: string; readonly isSet: true }
  | { readonly key: string; readonly notEmpty: true };

interface SettingDefinitionCommon {
  readonly key: string;
  readonly description: string;
  readonly categoryId: SettingCategoryId;
  readonly isRequired: boolean;
  readonly valueType: SettingValueTypeName;
  readonly allowedValues?: readonly string[];
  readonly assertValue?: (value: SettingValue) => void;
  /**
   * Paket 5.3.3 (D4): i18n key of the human title shown for this setting.
   * Defaults to `settings.registry.keys.<key>`, the dictionary the screens have
   * used since paket 4.1 — so a definition only names this when it needs a
   * different place in the dictionary.
   */
  readonly titleKey?: string;
  /** i18n key of the full explanation; defaults to `settings.registry.help.<key>`. */
  readonly helpKey?: string;
  /** Optional visual grouping inside the category (stable, free-form id). */
  readonly group?: string;
  /** Conditions that must hold before this setting may be active. */
  readonly requires?: readonly SettingCondition[];
}

export interface PublicSettingDefinition extends SettingDefinitionCommon {
  readonly visibility: 'public';
  readonly defaultValue?: SettingValue;
}

export interface PrivateSettingDefinition extends SettingDefinitionCommon {
  readonly visibility: 'private';
  readonly defaultValue?: SettingValue;
}

export interface SecretSettingDefinition extends SettingDefinitionCommon {
  readonly visibility: 'secret';
}

export type SettingDefinition =
  | PublicSettingDefinition
  | PrivateSettingDefinition
  | SecretSettingDefinition;

export interface SettingsRegistry {
  readonly definitions: readonly SettingDefinition[];
  getDefinition(key: string): SettingDefinition | undefined;
  requireDefinition(key: string): SettingDefinition;
  listByVisibility(visibility: SettingVisibility): readonly SettingDefinition[];
}

export type SettingsMutationInput = {
  readonly reason: string;
  readonly actorUserId: string | null;
};

export type SettingRegistryEntry = {
  readonly key: string;
  readonly description: string;
  /** Paket 5.3.3 (D4): resolved i18n keys — title is the human text, help the modal body. */
  readonly titleKey: string;
  readonly helpKey: string;
  readonly group: string | null;
  readonly requires: readonly SettingCondition[];
  readonly categoryId: SettingCategoryId;
  readonly categoryIcon: string;
  readonly categoryPriority: number;
  readonly valueType: SettingValueTypeName;
  readonly visibility: SettingVisibility;
  readonly isRequired: boolean;
  readonly defaultValue: SettingValue | null;
  readonly value: SettingValue | null;
  readonly isSet: boolean;
  readonly allowedValues?: readonly string[];
};
