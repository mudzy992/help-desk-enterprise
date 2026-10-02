/**
 * Paket 4.1 (§3a): product-neutral branding defaults. Every client sets its
 * own name, organisation, logo and support contacts under
 * Administracija → Postavke → Brending; nothing client-specific is hardcoded.
 */
export const defaultAppName = 'Service Desk';

export const brandingLimits = {
  appNameMaxLength: 60,
  taglineMaxLength: 120,
  organizationNameMaxLength: 120,
  supportEmailMaxLength: 254,
  supportUrlMaxLength: 500,
  logoMaxBytes: 200 * 1024,
  logoMaxDimension: 1024,
  publicCacheSeconds: 60,
  publicRequestsPerMinute: 120,
} as const;

export const logoMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoMimeType = (typeof logoMimeTypes)[number];
