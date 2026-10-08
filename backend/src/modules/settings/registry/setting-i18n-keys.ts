import type { SettingDefinition } from '../settings.types';

/**
 * Paket 5.3.3 (D4): every setting shows a human title with the raw key as the
 * subtitle. The dictionary in `frontend/src/i18n/locales/{bs,en}` has carried
 * `settings.registry.keys.<key>` descriptions since paket 4.1, so that is the
 * default title location; the modal body ("what it does, when to turn it on,
 * what happens next") lives under `settings.registry.help.<key>`.
 *
 * A definition only names `titleKey`/`helpKey` explicitly when it needs a slot
 * somewhere else in the dictionary. Keeping the convention here means the
 * registry has exactly one place that decides where a translation lives.
 */
export const settingTitleKeyPrefix = 'settings.registry.keys.';
export const settingHelpKeyPrefix = 'settings.registry.help.';

export function resolveSettingTitleKey(definition: SettingDefinition): string {
  return definition.titleKey ?? `${settingTitleKeyPrefix}${definition.key}`;
}

export function resolveSettingHelpKey(definition: SettingDefinition): string {
  return definition.helpKey ?? `${settingHelpKeyPrefix}${definition.key}`;
}
