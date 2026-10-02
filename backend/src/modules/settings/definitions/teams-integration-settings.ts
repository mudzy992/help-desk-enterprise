import {
  definePrivateSetting,
  defineSecretSetting,
} from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';
import { SettingsError } from '../settings.error';

/** Paket 3.1: connector modes; without the `teams` addon everything is off. */
export const teamsConnectorModes = ['simulator', 'live'] as const;
export type TeamsConnectorModeSetting = (typeof teamsConnectorModes)[number];

export const teamsDefaults = {
  mode: 'simulator' as TeamsConnectorModeSetting,
  personalEnabled: true,
  channelEnabled: true,
  channelIncludeTitle: false,
  ticketCreateEnabled: true,
  actionsEnabled: true,
  appShortName: '',
  appDescription: '',
} as const;

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalGuid(label: string) {
  return (value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value !== 'string' || !guid.test(value.trim())) throw new SettingsError(`${label}: a GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or empty`);
  };
}

function maxText(max: number, label: string) {
  return (value: unknown) => {
    if (typeof value !== 'string' || value.length > max) throw new SettingsError(`${label}: text up to ${max} characters`);
  };
}

const category = settingCategoryIds.privateIntegrations;

export const teamsIntegrationSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsMode,
    categoryId: category,
    valueType: 'string',
    description: 'Teams connector mode: simulator (no Microsoft resources, needs TEAMS_SIMULATOR_SECRET) or live (Bot Connector)',
    isRequired: true,
    defaultValue: teamsDefaults.mode,
    assertValue: (value) => {
      if (typeof value !== 'string' || !(teamsConnectorModes as readonly string[]).includes(value)) throw new SettingsError('Mode: simulator or live');
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsTenantId,
    categoryId: category,
    valueType: 'string',
    description: 'Microsoft Entra tenant ID of the organisation (live mode); activities from other tenants are refused',
    isRequired: false,
    defaultValue: '',
    assertValue: optionalGuid('Tenant ID'),
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsBotAppId,
    categoryId: category,
    valueType: 'string',
    description: 'Application (client) ID of the single-tenant bot app registration (live mode)',
    isRequired: false,
    defaultValue: '',
    assertValue: optionalGuid('Bot app ID'),
  }),
  defineSecretSetting({
    key: settingKeys.privateIntegrationsTeamsBotAppSecret,
    categoryId: category,
    valueType: 'string',
    description: 'Client secret of the bot app registration (live mode); leave empty when a certificate is used',
    isRequired: false,
  }),
  defineSecretSetting({
    key: settingKeys.privateIntegrationsTeamsBotCertificatePem,
    categoryId: category,
    valueType: 'string',
    description: 'Optional certificate and private key (PEM) of the bot app registration; preferred over a secret',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsPersonalEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Send personal Teams notifications (by each user\'s notification preferences)',
    isRequired: true,
    defaultValue: teamsDefaults.personalEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsChannelEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Post group events to the Teams channels linked to groups',
    isRequired: true,
    defaultValue: teamsDefaults.channelEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsChannelIncludeTitle,
    categoryId: category,
    valueType: 'boolean',
    description: 'Show the ticket title in channel cards (channels never show the description or messages)',
    isRequired: true,
    defaultValue: teamsDefaults.channelIncludeTitle,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsTicketCreateEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Allow creating tickets from Teams (personal chat command and the message action)',
    isRequired: true,
    defaultValue: teamsDefaults.ticketCreateEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsActionsEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Show action buttons on cards (claim, reply, approve, vote); off = cards only link to the application',
    isRequired: true,
    defaultValue: teamsDefaults.actionsEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsAppShortName,
    categoryId: category,
    valueType: 'string',
    description: 'Short name of the Teams app in the generated package (empty = application name from branding)',
    isRequired: false,
    defaultValue: teamsDefaults.appShortName,
    assertValue: maxText(30, 'Short name'),
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsTeamsAppDescription,
    categoryId: category,
    valueType: 'string',
    description: 'Short description of the Teams app in the generated package (empty = generic description)',
    isRequired: false,
    defaultValue: teamsDefaults.appDescription,
    assertValue: maxText(80, 'Description'),
  }),
];
