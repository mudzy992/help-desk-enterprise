import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsError } from '../../settings/settings.error';
import { SettingsService } from '../../settings/settings.service';
import { defaultEmailTemplates } from '../email/default-email-templates';
import {
  emailLocales,
  emailProviders,
  emailTemplateFields,
  emailTemplateKeys,
  emailTemplatePlaceholders,
  ticketEmailTemplateKeys,
  type EmailLocale,
  type EmailProvider,
  type EmailReplyMode,
  type EmailTemplateKey,
} from '../email/email-template.constants';
import type { EmailTemplateRegistry } from '../email/email-template.types';
import { renderEmailTemplatePreview } from '../email/email-template-preview';
import {
  loadEmailChannelConfiguration,
  type EmailChannelConfiguration,
} from '../email/load-email-channel-configuration';
import { MAIL_TRANSPORT, type MailTransport } from '../email/mail-transport';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import {
  diffEmailTemplateRegistry,
  parseEmailTemplateRegistry,
} from '../email/parse-email-template-registry';
import type { RenderedEmailMessage } from '../email/render-email-message';

export type EmailTemplatesOverview = {
  readonly locales: readonly EmailLocale[];
  readonly keys: readonly EmailTemplateKey[];
  readonly ticketKeys: readonly EmailTemplateKey[];
  readonly fields: readonly string[];
  readonly placeholders: readonly string[];
  readonly defaults: EmailTemplateRegistry;
  readonly templates: EmailTemplateRegistry;
  readonly overrides: Record<string, unknown>;
  readonly templatesEnabled: boolean;
  readonly delivery: {
    readonly deliveryEnabled: boolean;
    readonly hasSmtpTransport: boolean;
    readonly provider: EmailProvider;
    readonly providers: readonly EmailProvider[];
    readonly fromAddress: string | null;
    readonly replyMode: EmailReplyMode;
    readonly configuredReplyMode: EmailReplyMode;
    readonly replyToAddress: string | null;
    /** false → e-mails go out without buttons/links (APP_PUBLIC_URL missing). */
    readonly publicUrlConfigured: boolean;
  };
};

export type TestEmailResult = { readonly toAddress: string };

/** Design §5: at most 5 real test sends per admin in 10 minutes. */
const testSendLimit = 5;
const testSendWindowMs = 10 * 60_000;

@Injectable()
export class EmailTemplatesService {
  private readonly testSends = new Map<string, number[]>();

  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly mailTransport: MailTransport,
  ) {}

  async overview(): Promise<EmailTemplatesOverview> {
    const configuration = await loadEmailChannelConfiguration(this.settingsService);
    const templates = await this.storedTemplates();
    const provider = await this.provider(configuration);
    return {
      locales: emailLocales,
      keys: emailTemplateKeys,
      ticketKeys: ticketEmailTemplateKeys,
      fields: emailTemplateFields,
      placeholders: emailTemplatePlaceholders,
      defaults: defaultEmailTemplates,
      templates,
      overrides: diffEmailTemplateRegistry(templates),
      templatesEnabled: configuration.templatesEnabled,
      delivery: {
        deliveryEnabled: configuration.deliveryEnabled,
        hasSmtpTransport: configuration.smtp !== null,
        provider,
        providers: emailProviders,
        fromAddress: configuration.smtp?.fromAddress ?? null,
        replyMode: configuration.presentation.replyMode,
        configuredReplyMode: configuration.presentation.configuredReplyMode,
        replyToAddress: configuration.presentation.replyToAddress,
        publicUrlConfigured: configuration.presentation.publicUrl !== null,
      },
    };
  }

  /** Stores only what differs from the built-in texts (smaller diffs in the change log). */
  async save(
    overrides: Record<string, unknown>,
    mutation: { readonly reason: string; readonly actorUserId: string | null },
  ): Promise<EmailTemplatesOverview> {
    const parsed = parseEmailTemplateRegistry(JSON.stringify({ version: 2, locales: overrides }));
    await this.settingsService.setSettingValue(
      settingKeys.privateNotificationsTemplatesRegistryJson,
      JSON.stringify({ version: 2, locales: diffEmailTemplateRegistry(parsed) }),
      mutation,
    );
    return this.overview();
  }

  async preview(
    input: {
      readonly key: EmailTemplateKey;
      readonly locale: EmailLocale;
      readonly content?: Record<string, unknown>;
      readonly confidential?: boolean;
    },
    actorUserId: string | null,
  ): Promise<RenderedEmailMessage> {
    const configuration = await loadEmailChannelConfiguration(this.settingsService);
    const actor = await this.actor(actorUserId);
    return renderEmailTemplatePreview({
      configuration,
      templates: await this.templatesWithDraft(input),
      key: input.key,
      locale: input.locale,
      confidential: input.confidential === true,
      recipientName: actor?.displayName ?? 'Administrator',
      recipientEmail: actor?.email ?? 'admin@example.org',
    });
  }

  /** Sends the rendered sample to the signed-in admin only (no arbitrary recipients). */
  async sendTest(
    input: {
      readonly key: EmailTemplateKey;
      readonly locale: EmailLocale;
      readonly content?: Record<string, unknown>;
      readonly confidential?: boolean;
    },
    actorUserId: string | null,
  ): Promise<TestEmailResult> {
    const configuration = await loadEmailChannelConfiguration(this.settingsService);
    if (configuration.smtp === null) {
      throw new SettingsError(
        'SMTP is off or incomplete (host and From address are required)',
        'SMTP_NOT_CONFIGURED',
      );
    }
    const actor = await this.actor(actorUserId);
    if (actor === null || actor.email.trim().length === 0) {
      throw new SettingsError('Your account has no e-mail address', 'TEST_RECIPIENT_MISSING');
    }
    this.consumeTestSend(actorUserId ?? 'anonymous');
    const rendered = renderEmailTemplatePreview({
      configuration,
      templates: await this.templatesWithDraft(input),
      key: input.key,
      locale: input.locale,
      confidential: input.confidential === true,
      recipientName: actor.displayName,
      recipientEmail: actor.email,
    });
    try {
      await this.mailTransport.send(
        {
          from: configuration.smtp.fromAddress,
          to: actor.email,
          subject: `[TEST] ${rendered.subject}`,
          text: rendered.text,
          html: rendered.html,
          ...(configuration.presentation.replyToAddress === null
            ? {}
            : { replyTo: configuration.presentation.replyToAddress }),
          headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
        },
        configuration.smtp,
      );
    } catch (error) {
      await this.auditTestSend(actorUserId, input, 'failed');
      // The server's answer (e.g. "535 Authentication unsuccessful") is what the
      // admin needs to fix the configuration; it never contains the password.
      throw new SettingsError(
        `SMTP send failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
        'SMTP_SEND_FAILED',
      );
    }
    await this.auditTestSend(actorUserId, input, 'sent');
    return { toAddress: actor.email };
  }

  private async auditTestSend(
    actorUserId: string | null,
    input: { readonly key: EmailTemplateKey; readonly locale: EmailLocale },
    outcome: 'sent' | 'failed',
  ): Promise<void> {
    await recordAuditEntry(this.prisma as never, {
      action: auditLogActions.emailTemplateTestSent,
      entityType: auditLogEntityTypes.emailTemplate,
      entityId: input.key,
      metadata: { locale: input.locale, outcome },
      actorUserId,
    });
  }

  private async storedTemplates(): Promise<EmailTemplateRegistry> {
    return parseEmailTemplateRegistry(
      await this.settingsService.getSetting(settingKeys.privateNotificationsTemplatesRegistryJson),
    );
  }

  private async templatesWithDraft(input: {
    readonly key: EmailTemplateKey;
    readonly locale: EmailLocale;
    readonly content?: Record<string, unknown>;
  }): Promise<EmailTemplateRegistry> {
    const stored = await this.storedTemplates();
    if (input.content === undefined) {
      return stored;
    }
    // Validate the draft exactly like a save would, then overlay it.
    const draft = parseEmailTemplateRegistry(
      JSON.stringify({ version: 2, locales: { [input.locale]: { [input.key]: input.content } } }),
    );
    return {
      ...stored,
      [input.locale]: { ...stored[input.locale], [input.key]: draft[input.locale][input.key] },
    };
  }

  private async provider(configuration: EmailChannelConfiguration): Promise<EmailProvider> {
    if (configuration.smtp !== null) {
      return configuration.smtp.provider;
    }
    const value = await this.settingsService.getSetting(settingKeys.privateSmtpProvider);
    return typeof value === 'string' && (emailProviders as readonly string[]).includes(value)
      ? (value as EmailProvider)
      : 'o365';
  }

  private async actor(
    actorUserId: string | null,
  ): Promise<{ readonly email: string; readonly displayName: string } | null> {
    if (actorUserId === null) {
      return null;
    }
    return this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { email: true, displayName: true },
    });
  }

  private consumeTestSend(actorKey: string): void {
    const now = Date.now();
    const recent = (this.testSends.get(actorKey) ?? []).filter((at) => now - at < testSendWindowMs);
    if (recent.length >= testSendLimit) {
      throw new SettingsError('Too many test e-mails, try again in a few minutes', 'TEST_RATE_LIMITED');
    }
    this.testSends.set(actorKey, [...recent, now]);
  }
}
