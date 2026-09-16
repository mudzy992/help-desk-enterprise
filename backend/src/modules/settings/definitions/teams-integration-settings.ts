import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const teamsIntegrationSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsStubEnabled,
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'boolean',
    description:
      'Enable the Teams stub: enqueue TEAMS_STUB jobs without sending to Teams',
    isRequired: true,
    defaultValue: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateIntegrationsTeamsWebhookUrl,
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'string',
    description:
      'Teams webhook URL stored for a future connector; the stub never calls it',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsEventTypesCsv,
    categoryId: settingCategoryIds.privateIntegrations,
    valueType: 'string',
    description:
      'Comma-separated Teams stub event types (ticket.created, ticket.assigned, ticket.message, ticket.resolved, ticket.closed)',
    isRequired: false,
    defaultValue: '',
  }),
];
