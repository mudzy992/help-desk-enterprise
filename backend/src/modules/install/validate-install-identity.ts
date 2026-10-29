import { brandingLimits } from '../branding/branding.constants';
import { installIdentityErrorCodes } from './install-identity.constants';
import { InstallIdentityError } from './install-identity.error';
import {
  installIdentityLocales,
  type InstallIdentityInput,
  type InstallIdentityLocale,
} from './install-identity.types';
import { isSupportedInstallTimeZone } from './is-supported-install-time-zone';

/**
 * Install wizard v2 (F2): the wizard validates the shape (required fields,
 * lengths, locale, time zone, contact formats) before anything is written; the
 * settings registry then applies the same validators the Settings screen uses,
 * so an identity the wizard accepts can always be edited later.
 *
 * The logo is passed through untouched: the branding validator owns its size and
 * format rules (`validateLogoDataUrl`), and duplicating them here would let the
 * two rules drift apart.
 */
export function validateInstallIdentity(input: InstallIdentityInput): InstallIdentityInput {
  const organizationName = requireText(
    input.organizationName,
    brandingLimits.organizationNameMaxLength,
  );
  const appName = optionalText(input.appName, brandingLimits.appNameMaxLength);
  const tagline = optionalText(input.tagline, brandingLimits.taglineMaxLength);
  const locale: InstallIdentityLocale = input.locale ?? 'bs';
  if (!installIdentityLocales.includes(locale)) {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidLocale);
  }
  const timeZone = input.timeZone?.trim();
  if (timeZone !== undefined && timeZone.length > 0 && !isSupportedInstallTimeZone(timeZone)) {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidTimeZone);
  }
  const supportEmail = optionalText(input.supportEmail, brandingLimits.supportEmailMaxLength);
  if (supportEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidInput);
  }
  const supportUrl = optionalText(input.supportUrl, brandingLimits.supportUrlMaxLength);
  if (supportUrl !== undefined && !/^https:\/\/[^\s]+$/.test(supportUrl)) {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidInput);
  }
  return {
    organizationName,
    ...(appName === undefined ? {} : { appName }),
    ...(tagline === undefined ? {} : { tagline }),
    locale,
    ...(timeZone === undefined || timeZone.length === 0 ? {} : { timeZone }),
    ...(input.logoDataUrl === undefined ? {} : { logoDataUrl: input.logoDataUrl }),
    ...(supportEmail === undefined ? {} : { supportEmail }),
    ...(supportUrl === undefined ? {} : { supportUrl }),
  };
}

export function isInstallIdentityLocale(value: unknown): value is InstallIdentityLocale {
  return (
    typeof value === 'string' &&
    (installIdentityLocales as readonly string[]).includes(value)
  );
}

function requireText(value: unknown, maxLength: number): string {
  const normalized = optionalText(value, maxLength);
  if (normalized === undefined) {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidInput);
  }
  return normalized;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidInput);
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length > maxLength) {
    throw new InstallIdentityError(installIdentityErrorCodes.invalidInput);
  }
  return normalized;
}
