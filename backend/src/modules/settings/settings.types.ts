export type SettingVisibility = 'public' | 'private' | 'secret';

export type SettingValueTypeName = 'string' | 'number' | 'boolean';

export type SettingValue = string | number | boolean;

interface SettingDefinitionCommon {
  readonly key: string;
  readonly description: string;
  readonly isRequired: boolean;
  readonly valueType: SettingValueTypeName;
  readonly allowedValues?: readonly string[];
  readonly assertValue?: (value: SettingValue) => void;
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
  readonly valueType: SettingValueTypeName;
  readonly visibility: SettingVisibility;
  readonly isRequired: boolean;
  readonly defaultValue: SettingValue | null;
  readonly value: SettingValue | null;
  readonly isSet: boolean;
  readonly allowedValues?: readonly string[];
};
