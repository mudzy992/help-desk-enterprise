import { accountSecuritySettingRanges as r } from '../../settings/definitions/account-security-settings';
import { localPasswordConstants } from '../is-valid-local-password';

/** Paket 2.1 (M9): the effective account security policy. */
export type AccountSecurityPolicy = {
  readonly mfaRequiredForAdmins: boolean;
  readonly mfaAllowOptional: boolean;
  readonly mfaIssuerName: string;
  readonly passwordMinLength: number;
  readonly passwordMaxLength: number;
  readonly passwordBlocklistEnabled: boolean;
  readonly passwordHistoryCount: number;
  readonly passwordMaxAgeDays: number;
  readonly superAdminPasswordMaxAgeDays: number;
  readonly sessionsMaxPerUser: number;
  readonly sessionsNewDeviceAlert: boolean;
};

export const defaultAccountSecurityPolicy: AccountSecurityPolicy = {
  mfaRequiredForAdmins: true,
  mfaAllowOptional: true,
  mfaIssuerName: 'EP HelpDesk',
  passwordMinLength: r.passwordMinLength.default,
  passwordMaxLength: localPasswordConstants.maximumLength,
  passwordBlocklistEnabled: true,
  passwordHistoryCount: r.passwordHistoryCount.default,
  passwordMaxAgeDays: r.passwordMaxAgeDays.default,
  superAdminPasswordMaxAgeDays: r.superAdminPasswordMaxAgeDays.default,
  sessionsMaxPerUser: r.sessionsMaxPerUser.default,
  sessionsNewDeviceAlert: true,
};

