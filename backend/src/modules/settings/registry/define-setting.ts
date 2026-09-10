import type {
  PrivateSettingDefinition,
  PublicSettingDefinition,
  SecretSettingDefinition,
} from '../settings.types';

export function definePublicSetting(
  definition: Omit<PublicSettingDefinition, 'visibility'>,
): PublicSettingDefinition {
  return { ...definition, visibility: 'public' };
}

export function definePrivateSetting(
  definition: Omit<PrivateSettingDefinition, 'visibility'>,
): PrivateSettingDefinition {
  return { ...definition, visibility: 'private' };
}

export function defineSecretSetting(
  definition: Omit<SecretSettingDefinition, 'visibility'>,
): SecretSettingDefinition {
  return { ...definition, visibility: 'secret' };
}
