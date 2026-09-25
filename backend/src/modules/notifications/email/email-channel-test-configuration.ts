import { defaultEmailTemplates } from './default-email-templates';
import type {
  EmailChannelConfiguration,
  EmailPresentationConfiguration,
} from './load-email-channel-configuration';

/** Test fixture: a fully enabled channel with O365 SMTP and no-reply mode. */
export function createEmailChannelTestConfiguration(
  overrides: Partial<EmailChannelConfiguration> = {},
  presentation: Partial<EmailPresentationConfiguration> = {},
): EmailChannelConfiguration {
  return {
    deliveryEnabled: true,
    smtpEnabled: true,
    emailAddonEnabled: true,
    notificationsEmailEnabled: true,
    slaEscalationEmailEnabled: true,
    templatesEnabled: true,
    internalOnly: true,
    allowedExternalDomains: [],
    allowedExternalEmails: [],
    templates: defaultEmailTemplates,
    smtp: {
      host: 'smtp.office365.com',
      port: 587,
      tls: true,
      username: 'helpdesk@epbih.ba',
      password: 'smtp-secret-value',
      fromAddress: 'helpdesk@epbih.ba',
      provider: 'o365',
    },
    presentation: {
      appName: 'EP-HelpDesk',
      publicUrl: 'https://desk.epbih.ba',
      accentColor: '#4f46e5',
      includeMessageExcerpt: true,
      replyMode: 'no_reply',
      configuredReplyMode: 'no_reply',
      replyToAddress: null,
      defaultLocale: 'bs',
      fallbackLocale: 'en',
      supportedLocales: ['bs', 'en'],
      ...presentation,
    },
    ...overrides,
  };
}
