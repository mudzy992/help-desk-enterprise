import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition, SettingValue } from '../settings.types';

export const agentCollaborationLimits = {
  linksMaxPerTicket: { min: 1, max: 100, default: 20 },
} as const;

const category = settingCategoryIds.privateCollaboration;

function flag(
  key: string,
  description: string,
  defaultValue: boolean,
  requires?: SettingDefinition['requires'],
): SettingDefinition {
  return definePrivateSetting({
    key,
    categoryId: category,
    valueType: 'boolean',
    description,
    isRequired: true,
    defaultValue,
    ...(requires === undefined ? {} : { requires }),
  });
}

/** Paket 2.4 (§5). */
export const agentCollaborationSettings: readonly SettingDefinition[] = [
  flag(settingKeys.privateCollaborationPresenceEnabled, 'Show who is viewing a ticket or writing a reply, live', true),
  // Paket 5.3.3 (D6): showing presence to the requester only makes sense while
  // presence itself is switched on.
  flag(
    settingKeys.privateCollaborationPresenceShowToRequester,
    'The requester sees "An agent is writing a reply…" (without a name)',
    true,
    [{ key: settingKeys.privateCollaborationPresenceEnabled, equals: true }],
  ),
  flag(settingKeys.privateCollaborationCollisionWarningEnabled, 'Ask for confirmation before sending when a colleague is writing a reply', true),
  flag(settingKeys.privateCollaborationMentionsEnabled, '@mention colleagues in internal notes', true),
  flag(settingKeys.privateCollaborationFollowersEnabled, 'Follow button and the "Tickets I follow" view', true),
  flag(settingKeys.privateCollaborationFollowOnReply, 'Automatically follow a ticket when an agent writes on it without being assigned', false),
  flag(settingKeys.privateCollaborationLinksEnabled, 'Related tickets', true),
  definePrivateSetting({
    key: settingKeys.privateCollaborationLinksMaxPerTicket,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum related tickets per ticket (1-100)',
    isRequired: true,
    defaultValue: agentCollaborationLimits.linksMaxPerTicket.default,
    assertValue: (value: SettingValue) => {
      const { min, max } = agentCollaborationLimits.linksMaxPerTicket;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new SettingsError(`Related ticket limit must be an integer between ${min} and ${max}`);
      }
    },
  }),
];
