/**
 * Install wizard v2 (F2): the identity step gives the installation its name —
 * organisation, product name, language and time zone. Everything is written
 * through the settings registry (`public.branding.*`, `private.i18n.*`,
 * `private.reports.timeZone`), so the customer can change it later in Settings
 * with exactly the same validators.
 */
export type InstallIdentityLocale = 'bs' | 'en';

export const installIdentityLocales: readonly InstallIdentityLocale[] = ['bs', 'en'];

/** The logo travels as a data URL and is checked by the branding validator. */
export type InstallIdentityInput = {
  readonly organizationName: string;
  readonly appName?: string;
  readonly tagline?: string;
  readonly locale?: InstallIdentityLocale;
  readonly timeZone?: string;
  /** Omitted means "configure later": the stored logo stays as it is. */
  readonly logoDataUrl?: string;
  readonly supportEmail?: string;
  readonly supportUrl?: string;
};

export type InstallIdentityPublicRecord = {
  readonly organizationName: string;
  readonly appName: string;
  readonly tagline: string;
  readonly locale: InstallIdentityLocale;
  readonly timeZone: string;
  /** The logo itself is never read back by the wizard — only whether one exists. */
  readonly logoConfigured: boolean;
  readonly supportEmail: string;
  readonly supportUrl: string;
  /** `organizationName` is stored: the step from which the wizard moves on. */
  readonly isConfigured: boolean;
};

export type InstallIdentityStatus = {
  readonly identity: InstallIdentityPublicRecord;
};
