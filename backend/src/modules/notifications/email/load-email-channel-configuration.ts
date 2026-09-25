import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { defaultEmailTemplates } from './default-email-templates';
import { parseEmailTemplateRegistry } from './parse-email-template-registry';
import { parseSettingsCsv } from './parse-settings-csv';
import { resolveEmailChannelEnabled } from './resolve-email-channel-enabled';
import type { EmailTemplateRegistry } from './email-template.types';
import {
  defaultEmailAccentColor,
  emailLocales,
  emailProviderPresets,
  emailProviders,
  emailReplyModes,
  type EmailLocale,
  type EmailProvider,
  type EmailReplyMode,
} from './email-template.constants';

export type SmtpTransportConfig = {
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
  readonly provider: EmailProvider;
};

export type EmailPresentationConfiguration = {
  readonly appName: string;
  /** `APP_PUBLIC_URL` without trailing slash; null → e-mails go out without links. */
  readonly publicUrl: string | null;
  readonly accentColor: string;
  readonly includeMessageExcerpt: boolean;
  /** Effective mode: shared_mailbox without an address falls back to no_reply. */
  readonly replyMode: EmailReplyMode;
  readonly configuredReplyMode: EmailReplyMode;
  readonly replyToAddress: string | null;
  readonly defaultLocale: EmailLocale;
  readonly fallbackLocale: EmailLocale;
  readonly supportedLocales: readonly EmailLocale[];
};

export type EmailChannelConfiguration = {
  readonly deliveryEnabled: boolean;
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
  readonly notificationsEmailEnabled: boolean;
  readonly slaEscalationEmailEnabled: boolean;
  readonly templatesEnabled: boolean;
  readonly internalOnly: boolean;
  readonly allowedExternalDomains: readonly string[];
  readonly allowedExternalEmails: readonly string[];
  readonly templates: EmailTemplateRegistry;
  readonly smtp: SmtpTransportConfig | null;
  readonly presentation: EmailPresentationConfiguration;
};

export async function loadEmailChannelConfiguration(
  settingsService: SettingsService,
): Promise<EmailChannelConfiguration> {
  const smtpEnabled = (await settingsService.getSetting(
    settingKeys.privateSmtpEnabled,
  )) === true;
  const emailAddonEnabled = (await settingsService.getSetting(
    settingKeys.privateAddonsEmail,
  )) === true;
  const notificationsEmailEnabled = (await settingsService.getSetting(
    settingKeys.privateNotificationsEmailEnabled,
  )) === true;
  const slaEscalationEmailEnabled = (await settingsService.getSetting(
    settingKeys.privateTicketSlaEscalationsEmailEnabled,
  )) === true;
  const templatesEnabled = (await settingsService.getSetting(
    settingKeys.privateNotificationsTemplatesEnabled,
  )) === true;
  const internalOnly = (await settingsService.getSetting(
    settingKeys.privateNotificationsEmailInternalOnly,
  )) !== false;
  const templates = templatesEnabled
    ? parseEmailTemplateRegistry(
        await settingsService.getSetting(
          settingKeys.privateNotificationsTemplatesRegistryJson,
        ),
      )
    : defaultEmailTemplates;
  return {
    deliveryEnabled: resolveEmailChannelEnabled({
      smtpEnabled,
      emailAddonEnabled,
      notificationsEmailEnabled,
    }),
    smtpEnabled,
    emailAddonEnabled,
    notificationsEmailEnabled,
    slaEscalationEmailEnabled,
    templatesEnabled,
    internalOnly,
    allowedExternalDomains: parseSettingsCsv(
      await settingsService.getSetting(
        settingKeys.privateNotificationsEmailAllowedExternalDomainsCsv,
      ),
    ),
    allowedExternalEmails: parseSettingsCsv(
      await settingsService.getSetting(
        settingKeys.privateNotificationsEmailAllowedExternalEmailsCsv,
      ),
    ),
    templates,
    smtp: smtpEnabled ? await readSmtpTransportConfig(settingsService) : null,
    presentation: await readEmailPresentation(settingsService),
  };
}

async function readSmtpTransportConfig(
  settingsService: SettingsService,
): Promise<SmtpTransportConfig | null> {
  const provider = pick(
    await settingsService.getSetting(settingKeys.privateSmtpProvider),
    emailProviders,
    'o365',
  );
  const preset = provider === 'smtp' ? null : emailProviderPresets[provider];
  const configuredHost = asString(
    await settingsService.getSetting(settingKeys.privateSmtpHost),
  );
  // Decision E10: the preset applies only while the admin has not typed a host.
  const host = configuredHost.length > 0 ? configuredHost : (preset?.host ?? '');
  const fromAddress = asString(
    await settingsService.getSetting(settingKeys.privateSmtpFromAddress),
  );
  const port =
    configuredHost.length === 0 && preset !== null
      ? preset.port
      : asNumber(await settingsService.getSetting(settingKeys.privateSmtpPort), 587);
  if (host.length === 0 || fromAddress.length === 0) {
    return null;
  }
  return {
    host,
    port,
    tls:
      configuredHost.length === 0 && preset !== null
        ? preset.tls
        : (await settingsService.getSetting(settingKeys.privateSmtpTls)) !== false,
    username: asString(
      await settingsService.getSetting(settingKeys.privateSmtpUsername),
    ),
    password: asString(
      await settingsService.getSecretForInternalUse(
        settingKeys.privateSmtpPassword,
      ),
    ),
    fromAddress,
    provider,
  };
}

export async function readEmailPresentation(
  settingsService: SettingsService,
): Promise<EmailPresentationConfiguration> {
  const configuredReplyMode = pick(
    await settingsService.getSetting(settingKeys.privateNotificationsEmailReplyMode),
    emailReplyModes,
    'no_reply',
  );
  const replyTo = asString(
    await settingsService.getSetting(settingKeys.privateNotificationsEmailReplyToAddress),
  );
  const replyMode =
    configuredReplyMode === 'shared_mailbox' && replyTo.length > 0 ? 'shared_mailbox' : 'no_reply';
  const supported = asString(
    await settingsService.getSetting(settingKeys.privateI18nSupportedLocalesCsv),
  )
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is EmailLocale => (emailLocales as readonly string[]).includes(entry));
  const appName = asString(await settingsService.getSetting(settingKeys.publicBrandingAppName));
  const accent = asString(
    await settingsService.getSetting(settingKeys.privateNotificationsEmailAccentColor),
  );
  return {
    appName: appName.length > 0 ? appName : 'EP-HelpDesk',
    publicUrl: readPublicAppUrl(),
    accentColor: accent.length > 0 ? accent : defaultEmailAccentColor,
    includeMessageExcerpt:
      (await settingsService.getSetting(
        settingKeys.privateNotificationsEmailIncludeMessageExcerpt,
      )) !== false,
    replyMode,
    configuredReplyMode,
    replyToAddress: replyMode === 'shared_mailbox' ? replyTo : null,
    defaultLocale: pick(
      await settingsService.getSetting(settingKeys.privateI18nDefaultLocale),
      emailLocales,
      'bs',
    ),
    fallbackLocale: pick(
      await settingsService.getSetting(settingKeys.privateI18nFallbackLocale),
      emailLocales,
      'en',
    ),
    supportedLocales: supported.length > 0 ? supported : [...emailLocales],
  };
}

/** Links in e-mails need the public frontend URL; without it they are omitted. */
export function readPublicAppUrl(): string | null {
  const value = (process.env.APP_PUBLIC_URL ?? '').trim();
  if (value.length === 0) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
