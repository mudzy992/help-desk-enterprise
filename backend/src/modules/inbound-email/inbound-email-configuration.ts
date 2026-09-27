import type { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import {
  inboundEmailSettingDefaults as d,
  inboundImapAuthMethods,
  inboundProviders,
} from '../settings/definitions/inbound-email-settings';

export type InboundProvider = (typeof inboundProviders)[number];

export type InboundEmailConfiguration = {
  readonly enabled: boolean;
  readonly provider: InboundProvider;
  readonly address: string;
  readonly pollSeconds: number;
  readonly graph: { readonly tenantId: string; readonly clientId: string; readonly clientSecret: string };
  readonly imap: {
    readonly host: string;
    readonly port: number;
    readonly tls: boolean;
    readonly username: string;
    readonly password: string;
    readonly authMethod: (typeof inboundImapAuthMethods)[number];
  };
  readonly processedFolder: string;
  readonly rejectedFolder: string;
  readonly requireAuthPass: boolean;
  readonly createTickets: boolean;
  readonly defaultServiceId: string;
  readonly rawRetentionDays: number;
  readonly metadataRetentionDays: number;
  readonly maxPerSenderPerHour: number;
  readonly maxMessagesPerRun: number;
};

/** Missing pieces that stop the connector; shown on the admin page. */
export function inboundConfigurationProblems(configuration: InboundEmailConfiguration): string[] {
  const problems: string[] = [];
  if (configuration.address.length === 0) problems.push('ADDRESS_MISSING');
  const needsEntra = configuration.provider === 'graph' || configuration.imap.authMethod === 'oauth2_entra';
  if (needsEntra) {
    const { tenantId, clientId, clientSecret } = configuration.graph;
    if (tenantId.length === 0 || clientId.length === 0 || clientSecret.length === 0) problems.push('ENTRA_APP_MISSING');
  }
  if (configuration.provider === 'imap') {
    if (configuration.imap.host.length === 0 || configuration.imap.username.length === 0) problems.push('IMAP_SERVER_MISSING');
    if (configuration.imap.authMethod === 'password' && configuration.imap.password.length === 0) {
      problems.push('IMAP_PASSWORD_MISSING');
    }
  }
  if (configuration.createTickets && configuration.defaultServiceId.length === 0) problems.push('DEFAULT_SERVICE_MISSING');
  return problems;
}

export async function loadInboundEmailConfiguration(settings: SettingsService): Promise<InboundEmailConfiguration> {
  const read = async (key: string): Promise<unknown> => {
    try {
      return await settings.getSetting(key);
    } catch {
      return undefined;
    }
  };
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const integer = (value: unknown, range: { min: number; max: number; default: number }) =>
    typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max ? value : range.default;
  const k = settingKeys;
  const values = await Promise.all(
    [
      k.privateInboundEnabled,
      k.privateInboundProvider,
      k.privateInboundAddress,
      k.privateInboundPollSeconds,
      k.privateInboundGraphTenantId,
      k.privateInboundGraphClientId,
      k.privateInboundGraphClientSecret,
      k.privateInboundImapHost,
      k.privateInboundImapPort,
      k.privateInboundImapTls,
      k.privateInboundImapUsername,
      k.privateInboundImapPassword,
      k.privateInboundImapAuthMethod,
      k.privateInboundProcessedFolder,
      k.privateInboundRejectedFolder,
      k.privateInboundRequireAuthPass,
      k.privateInboundCreateTickets,
      k.privateInboundDefaultServiceId,
      k.privateInboundRawRetentionDays,
      k.privateInboundMetadataRetentionDays,
      k.privateInboundMaxPerSenderPerHour,
      k.privateInboundMaxMessagesPerRun,
    ].map(read),
  );
  const [
    enabled,
    provider,
    address,
    pollSeconds,
    tenantId,
    clientId,
    clientSecret,
    imapHost,
    imapPort,
    imapTls,
    imapUsername,
    imapPassword,
    imapAuthMethod,
    processedFolder,
    rejectedFolder,
    requireAuthPass,
    createTickets,
    defaultServiceId,
    rawRetentionDays,
    metadataRetentionDays,
    maxPerSenderPerHour,
    maxMessagesPerRun,
  ] = values;
  return {
    enabled: enabled === true,
    provider: (inboundProviders as readonly string[]).includes(text(provider)) ? (text(provider) as InboundProvider) : d.provider,
    address: text(address).toLowerCase(),
    pollSeconds: integer(pollSeconds, d.pollSeconds),
    graph: { tenantId: text(tenantId), clientId: text(clientId), clientSecret: text(clientSecret) },
    imap: {
      host: text(imapHost),
      port: typeof imapPort === 'number' && imapPort > 0 && imapPort < 65536 ? imapPort : d.imapPort,
      tls: imapTls !== false,
      username: text(imapUsername),
      password: typeof imapPassword === 'string' ? imapPassword : '',
      authMethod: text(imapAuthMethod) === 'oauth2_entra' ? 'oauth2_entra' : 'password',
    },
    processedFolder: text(processedFolder) || d.processedFolder,
    rejectedFolder: text(rejectedFolder) || d.rejectedFolder,
    requireAuthPass: requireAuthPass !== false,
    createTickets: createTickets === true,
    defaultServiceId: text(defaultServiceId),
    rawRetentionDays: integer(rawRetentionDays, d.rawRetentionDays),
    metadataRetentionDays: integer(metadataRetentionDays, d.metadataRetentionDays),
    maxPerSenderPerHour: integer(maxPerSenderPerHour, d.maxPerSenderPerHour),
    maxMessagesPerRun: integer(maxMessagesPerRun, d.maxMessagesPerRun),
  };
}

/** Stable key per mailbox (idempotency + health row). */
export function inboundMailboxKey(configuration: InboundEmailConfiguration): string {
  return `${configuration.provider}:${configuration.address}`;
}
