import { definePrivateSetting } from '../registry/define-setting';
import { SettingsError } from '../settings.error';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition, SettingValue } from '../settings.types';

export const defaultEdgeExtensionPollingIntervalSeconds = 90;
export const edgeExtensionPollingIntervalMinimumSeconds = 60;
export const edgeExtensionPollingIntervalMaximumSeconds = 120;
export const defaultEdgeExtensionReconnectMaxBackoffSeconds = 60;
export const defaultEdgeExtensionAllowedEmailDomain = 'epbih.ba';

export const edgeExtensionSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionEnabled,
    valueType: 'boolean',
    description: 'Enable the Edge extension companion client module',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionAllowedEmailDomain,
    valueType: 'string',
    description: 'Email domain allowed to use the Edge extension',
    isRequired: true,
    defaultValue: defaultEdgeExtensionAllowedEmailDomain,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionWsEnabled,
    valueType: 'boolean',
    description: 'Allow the Edge extension to open a Socket.IO connection',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionWsReconnectMaxBackoffSeconds,
    valueType: 'number',
    description: 'Maximum Socket.IO reconnect backoff in seconds',
    isRequired: true,
    defaultValue: defaultEdgeExtensionReconnectMaxBackoffSeconds,
    assertValue: assertPositiveInteger,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionWsMinClientVersion,
    valueType: 'string',
    description:
      'Minimum extension version allowed to connect; empty means no floor',
    isRequired: false,
    defaultValue: '',
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionNotificationsRedactedPreviews,
    valueType: 'boolean',
    description:
      'Show only event type and ticket id in OS toasts, never message content',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionReceiptsEnabled,
    valueType: 'boolean',
    description: 'Accept delivered and opened receipts from the extension',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionEventsDedupEnabled,
    valueType: 'boolean',
    description: 'Tell the extension to deduplicate events by eventId',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionKillSwitchEnabled,
    valueType: 'boolean',
    description:
      'When true, the kill switch is engaged and the extension must not connect',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionPollingFallbackEnabled,
    valueType: 'boolean',
    description: 'Poll unread notifications when the Socket.IO connection drops',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateEdgeExtensionPollingFallbackIntervalSeconds,
    valueType: 'number',
    description: 'Unread polling interval in seconds while WebSocket is down',
    isRequired: true,
    defaultValue: defaultEdgeExtensionPollingIntervalSeconds,
    assertValue: assertPollingInterval,
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
