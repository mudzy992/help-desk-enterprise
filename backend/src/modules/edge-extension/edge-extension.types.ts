import type {
  EdgeExtensionDenyReason,
  EdgeExtensionReceiptKind,
} from './edge-extension.constants';

export type EdgeExtensionConfiguration = {
  readonly addonEnabled: boolean;
  readonly moduleEnabled: boolean;
  readonly notificationsEdgeEnabled: boolean;
  readonly killSwitchEnabled: boolean;
  readonly wsEnabled: boolean;
  readonly reconnectMaxBackoffSeconds: number;
  readonly minClientVersion: string;
  readonly redactedPreviews: boolean;
  readonly receiptsEnabled: boolean;
  readonly dedupEnabled: boolean;
  readonly pollingFallbackEnabled: boolean;
  readonly pollingIntervalSeconds: number;
  readonly allowedEmailDomain: string;
  readonly chatEnabled: boolean;
  readonly chatMaxMessagesPerTicket: number;
  readonly attachmentsEnabled: boolean;
  readonly remoteEnabled: boolean;
  readonly remoteRateLimitMinutesPerTicket: number;
  readonly requireUserClickToOpenQuickAssist: boolean;
  readonly auditAcknowledge: boolean;
};

export type EdgeExtensionBootstrapResponse = {
  readonly allowed: boolean;
  readonly reason: EdgeExtensionDenyReason;
  readonly deskPublicUrl: string;
  readonly wsEnabled: boolean;
  readonly reconnectMaxBackoffSeconds: number;
  readonly pollingFallbackEnabled: boolean;
  readonly pollingIntervalSeconds: number;
  readonly redactedPreviews: boolean;
  readonly receiptsEnabled: boolean;
  readonly dedupEnabled: boolean;
  readonly minClientVersion: string;
  readonly allowedEmailDomain: string;
  readonly subjectId: string;
  readonly chatEnabled: boolean;
  readonly chatMaxMessagesPerTicket: number;
  readonly attachmentsEnabled: boolean;
  readonly remoteEnabled: boolean;
  readonly remoteRateLimitMinutesPerTicket: number;
  readonly requireUserClickToOpenQuickAssist: boolean;
  readonly auditAcknowledge: boolean;
};

export type EdgeExtensionReceiptResponse = {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly kind: EdgeExtensionReceiptKind;
  readonly notificationId: string;
  readonly eventId: string;
};
