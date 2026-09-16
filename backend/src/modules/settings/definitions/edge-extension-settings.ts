import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';
import { settingCategoryIds } from '../setting-categories';

export const defaultEdgeExtensionPollingIntervalSeconds = 90;
export const edgeExtensionPollingIntervalMinimumSeconds = 60;
export const edgeExtensionPollingIntervalMaximumSeconds = 120;
export const defaultEdgeExtensionReconnectMaxBackoffSeconds = 60;
export const defaultEdgeExtensionAllowedEmailDomain = 'epbih.ba';
export const defaultEdgeExtensionChatMaxMessagesPerTicket = 50;
export const defaultEdgeExtensionRemoteRateLimitMinutes = 10;

export const edgeExtensionSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Enable the Edge extension companion client module',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionAllowedEmailDomain,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'string',
    description: 'Email domain allowed to use the Edge extension',
    isRequired: true,
    defaultValue: defaultEdgeExtensionAllowedEmailDomain,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionWsEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Allow the Edge extension to open a Socket.IO connection',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionWsReconnectMaxBackoffSeconds,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'number',
    description: 'Maximum Socket.IO reconnect backoff in seconds',
    isRequired: true,
    defaultValue: defaultEdgeExtensionReconnectMaxBackoffSeconds,
    assertValue: assertPositiveInteger,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionWsMinClientVersion,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'string',
    description:
      'Minimum extension version allowed to connect; empty means no floor',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionNotificationsRedactedPreviews,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description:
      'Show only event type and ticket id in OS toasts, never message content',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionReceiptsEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Accept delivered and opened receipts from the extension',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionEventsDedupEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Tell the extension to deduplicate events by eventId',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionKillSwitchEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description:
      'When true, the kill switch is engaged and the extension must not connect',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionPollingFallbackEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Poll unread notifications when the Socket.IO connection drops',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionPollingFallbackIntervalSeconds,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'number',
    description: 'Unread polling interval in seconds while WebSocket is down',
    isRequired: true,
    defaultValue: defaultEdgeExtensionPollingIntervalSeconds,
    assertValue: assertPollingInterval,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionChatEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Enable quick reply chat in the Edge extension popup',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionChatMaxMessagesPerTicket,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'number',
    description: 'Maximum messages loaded per ticket in the extension popup',
    isRequired: true,
    defaultValue: defaultEdgeExtensionChatMaxMessagesPerTicket,
    assertValue: assertPositiveInteger,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionAttachmentsEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description:
      'Allow attachment upload from the Edge extension chat; off in MVP',
    isRequired: true,
    defaultValue: false,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionRemoteEnabled,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Enable Request Remote / Quick Assist through the extension',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionRemoteRateLimitMinutesPerTicket,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'number',
    description: 'Minimum minutes between remote requests on the same ticket',
    isRequired: true,
    defaultValue: defaultEdgeExtensionRemoteRateLimitMinutes,
    assertValue: assertPositiveInteger,
  }),
  definePrivateSetting({
    key:
      settingKeys.privateEdgeExtensionRemoteRequireUserClickToOpenQuickAssist,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description:
      'Require an explicit user click before opening ms-quick-assist',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionRemoteAuditAcknowledge,
    categoryId: settingCategoryIds.privateEdgeExtension,
    valueType: 'boolean',
    description: 'Write an audit entry when the user opens Quick Assist',
    isRequired: true,
    defaultValue: true,
  }),
];

function assertPositiveInteger(value: SettingValue): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new SettingsError(
      'Edge extension numeric settings must be positive integers',
    );
  }
}

function assertPollingInterval(value: SettingValue): void {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < edgeExtensionPollingIntervalMinimumSeconds ||
    value > edgeExtensionPollingIntervalMaximumSeconds
  ) {
    throw new SettingsError(
      'Edge polling interval must be an integer from 60 to 120',
    );
  }
}
