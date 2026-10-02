/**
 * Paket 4.1 (§5): HKDF / hash labels for keys derived from MFA_ENCRYPTION_KEY.
 * New data always uses these (v2). Older data is read with the labels in
 * `legacy-kdf-labels.ts`.
 */
export const kdfLabels = {
  assetLicenseKey: 'service-desk:asset-license-key:v2',
  inboundReplyToken: 'service-desk:inbound-reply-token:v2',
  privacyTombstone: 'service-desk:privacy-tombstone:v2',
  privacyExport: 'service-desk:privacy-export:v2',
} as const;
