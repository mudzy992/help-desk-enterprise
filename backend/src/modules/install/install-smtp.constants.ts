export const installSmtpConstants = {
  changeLogReason: 'install_wizard',
  defaultPort: 587,
  defaultTls: true,
  maximumHostLength: 255,
  maximumUsernameLength: 256,
  maximumPasswordLength: 256,
  maximumFromAddressLength: 254,
  minimumPort: 1,
  maximumPort: 65535,
  hostPattern: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9])?$/,
  fromAddressPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

export const installSmtpErrorCodes = {
  invalidConfiguration: 'INVALID_SMTP_CONFIGURATION',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
} as const;
