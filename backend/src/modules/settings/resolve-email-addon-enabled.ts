export function resolveEmailAddonEnabled(input: {
  readonly smtpEnabled: boolean;
  readonly emailAddonEnabled: boolean;
}): boolean {
  return input.smtpEnabled === true && input.emailAddonEnabled === true;
}
