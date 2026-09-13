import { resolveEmailAddonEnabled } from '../../settings/resolve-email-addon-enabled';

export function resolveEmailChannelEnabled(input: {
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
  readonly notificationsEmailEnabled: boolean;
}): boolean {
  return (
    resolveEmailAddonEnabled({
      smtpEnabled: input.smtpEnabled,
      emailAddonEnabled: input.emailAddonEnabled,
    }) && input.notificationsEmailEnabled === true
  );
}
