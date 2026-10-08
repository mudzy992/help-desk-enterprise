import { defineSecretSetting, definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition, SettingValue } from '../settings.types';

/** Paket 2.3 (§6): inbound mailbox defaults and ranges. */
export const inboundEmailSettingDefaults = {
  provider: 'graph',
  pollSeconds: { min: 30, max: 600, default: 60 },
  imapPort: 993,
  processedFolder: 'HelpDesk/Obradjeno',
  rejectedFolder: 'HelpDesk/Odbijeno',
  rawRetentionDays: { min: 0, max: 365, default: 30 },
  metadataRetentionDays: { min: 30, max: 1095, default: 180 },
  maxPerSenderPerHour: { min: 1, max: 500, default: 20 },
  maxMessagesPerRun: { min: 1, max: 500, default: 50 },
} as const;

export const inboundProviders = ['graph', 'imap'] as const;
export const inboundImapAuthMethods = ['password', 'oauth2_entra'] as const;

const category = settingCategoryIds.privateInbound;
const d = inboundEmailSettingDefaults;

function integerBetween(label: string, min: number, max: number) {
  return (value: SettingValue): void => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new SettingsError(`${label} must be an integer between ${min} and ${max}`);
    }
  };
}

function folderPath(label: string) {
  return (value: SettingValue): void => {
    if (typeof value !== 'string' || !/^[\p{L}\p{N} _.\-/]{1,120}$/u.test(value) || value.split('/').some((part) => part.trim() === '')) {
      throw new SettingsError(`${label} must be a folder path like "HelpDesk/Obradjeno"`);
    }
  };
}

function optionalEmail(value: SettingValue): void {
  if (typeof value !== 'string' || (value.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    throw new SettingsError('Inbound mailbox address must be an e-mail address');
  }
}

export const inboundEmailSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateInboundEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Read the support mailbox and turn replies to notifications into ticket messages',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundProvider,
    categoryId: category,
    valueType: 'string',
    description: 'Mailbox connector: Microsoft Graph (Office 365) or IMAP (any server, including Gmail)',
    isRequired: true,
    allowedValues: [...inboundProviders],
    defaultValue: d.provider,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundAddress,
    categoryId: category,
    valueType: 'string',
    description: 'Support mailbox address (normally the same as the Reply-To address)',
    isRequired: false,
    defaultValue: '',
    assertValue: optionalEmail,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundPollSeconds,
    categoryId: category,
    valueType: 'number',
    description: 'How often the mailbox is checked, in seconds (30-600)',
    isRequired: true,
    defaultValue: d.pollSeconds.default,
    assertValue: integerBetween('Poll interval', d.pollSeconds.min, d.pollSeconds.max),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundGraphTenantId,
    categoryId: category,
    valueType: 'string',
    description: 'Microsoft Entra tenant ID for the mailbox application',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundGraphClientId,
    categoryId: category,
    valueType: 'string',
    description: 'Application (client) ID with Mail.ReadWrite limited to the support mailbox',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateInboundGraphClientSecret,
    categoryId: category,
    valueType: 'string',
    description: 'Client secret of the mailbox application; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundImapHost,
    categoryId: category,
    valueType: 'string',
    description: 'IMAP server host (e.g. outlook.office365.com, imap.gmail.com)',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundImapPort,
    categoryId: category,
    valueType: 'number',
    description: 'IMAP port (993 = implicit TLS)',
    isRequired: true,
    defaultValue: d.imapPort,
    assertValue: integerBetween('IMAP port', 1, 65535),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundImapTls,
    categoryId: category,
    valueType: 'boolean',
    description: 'Use TLS for IMAP (strongly recommended)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundImapUsername,
    categoryId: category,
    valueType: 'string',
    description: 'IMAP user name (usually the mailbox address)',
    isRequired: false,
    defaultValue: '',
  }),
  defineSecretSetting({
    key: settingKeys.privateInboundImapPassword,
    categoryId: category,
    valueType: 'string',
    description: 'IMAP password or app password; never expose outside trusted backend use',
    isRequired: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundImapAuthMethod,
    categoryId: category,
    valueType: 'string',
    description: 'IMAP sign-in: password, or OAuth2 with the Entra application above (required for Office 365)',
    isRequired: true,
    allowedValues: [...inboundImapAuthMethods],
    defaultValue: 'password',
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundProcessedFolder,
    categoryId: category,
    valueType: 'string',
    description: 'Folder that processed e-mails are moved to (created when missing)',
    isRequired: true,
    defaultValue: d.processedFolder,
    assertValue: folderPath('Processed folder'),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundRejectedFolder,
    categoryId: category,
    valueType: 'string',
    description: 'Folder that rejected and ignored e-mails are moved to (created when missing)',
    isRequired: true,
    defaultValue: d.rejectedFolder,
    assertValue: folderPath('Rejected folder'),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundRequireAuthPass,
    categoryId: category,
    valueType: 'boolean',
    description: 'Accept only e-mails that passed DMARC, or SPF and DKIM (protection against forged senders)',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundCreateTickets,
    requires: [{ key: settingKeys.privateInboundEnabled, equals: true }],
    categoryId: category,
    valueType: 'boolean',
    description: 'A new e-mail from a known user (not a reply) opens a ticket on the default service',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundDefaultServiceId,
    categoryId: category,
    valueType: 'string',
    description: 'Service for tickets opened by e-mail (e.g. "General inquiry"); required when ticket creation is on',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundRawRetentionDays,
    categoryId: category,
    valueType: 'number',
    description: 'Days the original e-mail (.eml) is kept for review (0 = not kept)',
    isRequired: true,
    defaultValue: d.rawRetentionDays.default,
    assertValue: integerBetween('Raw e-mail retention', d.rawRetentionDays.min, d.rawRetentionDays.max),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundMetadataRetentionDays,
    categoryId: category,
    valueType: 'number',
    description: 'Days the inbound e-mail log (sender, subject, outcome) is kept',
    isRequired: true,
    defaultValue: d.metadataRetentionDays.default,
    assertValue: integerBetween('Inbound log retention', d.metadataRetentionDays.min, d.metadataRetentionDays.max),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundMaxPerSenderPerHour,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum e-mails accepted per sender per hour; the rest is rejected (loop protection)',
    isRequired: true,
    defaultValue: d.maxPerSenderPerHour.default,
    assertValue: integerBetween('Per-sender limit', d.maxPerSenderPerHour.min, d.maxPerSenderPerHour.max),
  }),
  definePrivateSetting({
    key: settingKeys.privateInboundMaxMessagesPerRun,
    categoryId: category,
    valueType: 'number',
    description: 'Maximum e-mails processed per mailbox check',
    isRequired: true,
    defaultValue: d.maxMessagesPerRun.default,
    assertValue: integerBetween('Messages per run', d.maxMessagesPerRun.min, d.maxMessagesPerRun.max),
  }),
];
