export const edgeExtensionReceiptKinds = ['delivered', 'opened'] as const;

export type EdgeExtensionReceiptKind =
  (typeof edgeExtensionReceiptKinds)[number];

export const edgeExtensionDenyReasons = {
  ok: 'OK',
  addonOff: 'ADDON_OFF',
  disabled: 'DISABLED',
  notificationsOff: 'NOTIFICATIONS_EDGE_OFF',
  killSwitch: 'KILL_SWITCH',
  domain: 'DOMAIN',
  version: 'VERSION',
} as const;

export type EdgeExtensionDenyReason =
  (typeof edgeExtensionDenyReasons)[keyof typeof edgeExtensionDenyReasons];

export type EdgeExtensionErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'RECEIPTS_DISABLED'
  | 'REMOTE_DISABLED'
  | 'REMOTE_NOT_REQUESTED';
