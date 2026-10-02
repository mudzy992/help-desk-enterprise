/**
 * Paket 4.1 (§5): v1 derivation labels. DO NOT CHANGE OR REMOVE these strings
 * without a migration: they are inputs to key derivation, and changing them
 * makes existing data permanently unreadable.
 *
 * - assetLicenseKeyV1: licence keys written before v2; `rekey-asset-licenses`
 *   re-encrypts them, after which this label is only a fallback.
 * - inboundReplyTokenV1: replies to e-mails sent before v2 are still matched;
 *   remove 180 days after the v2 deploy (e-mail delivery retention).
 * - privacyTombstoneV1: tombstones are one-way HMACs and cannot be recomputed,
 *   so this label stays permanently.
 * - privacyExportV1: export files created before v2 stay downloadable until
 *   they expire.
 *
 * This file is the single documented exception in scripts/check-client-neutral.mjs.
 */
export const legacyKdfLabels = {
  assetLicenseKeyV1: 'ephelpdesk:asset-license-key:v1',
  inboundReplyTokenV1: 'ephelpdesk-inbound-reply-token',
  privacyTombstoneV1: 'ephelpdesk:privacy-tombstone:v1',
  privacyExportV1: 'ephelpdesk:privacy-export:v1',
} as const;
