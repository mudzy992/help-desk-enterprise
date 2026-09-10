export type SettingVisibility = 'public' | 'private' | 'secret';

export type SettingValueTypeName = 'string' | 'number' | 'boolean';

export type SettingValue = string | number | boolean;

interface SettingDefinitionCommon {
  readonly key: string;
  readonly description: string;
  readonly isRequired: boolean;
  readonly valueType: SettingValueTypeName;
  readonly allowedValues?: readonly string[];
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
