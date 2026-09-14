import { definePrivateSetting } from '../registry/define-setting';
import { settingKeys } from '../setting-keys';
import type { SettingDefinition } from '../settings.types';

export const integrationQueueSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueEnabled,
    valueType: 'boolean',
    description: 'Send outgoing integrations through the durable BullMQ queue',
    isRequired: true,
    defaultValue: true,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueTypesCsv,
    valueType: 'string',
    description:
      'Comma-separated integration types that use the durable queue (email, edge, teams)',
    isRequired: true,
    defaultValue: 'email,edge,teams',
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueMaxAttempts,
    valueType: 'number',
    description: 'Maximum delivery attempts before a job stops retrying',
    isRequired: true,
    defaultValue: 10,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueInitialBackoffSeconds,
    valueType: 'number',
    description: 'Initial retry backoff in seconds',
    isRequired: true,
    defaultValue: 60,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueMaxBackoffSeconds,
    valueType: 'number',
    description: 'Maximum retry backoff in seconds',
    isRequired: true,
    defaultValue: 3600,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueDeadLetterAfterAttempts,
    valueType: 'number',
    description: 'Attempt count after which a failed job moves to DLQ',
    isRequired: true,
    defaultValue: 10,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueDeadLetterRetentionDays,
    valueType: 'number',
    description: 'Days to retain DLQ jobs before the worker deletes them',
    isRequired: true,
    defaultValue: 30,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueWorkerPollSeconds,
    valueType: 'number',
    description:
      'Worker interval for settings refresh and DLQ retention sweeps',
    isRequired: true,
    defaultValue: 5,
  }),
  definePrivateSetting({
    key: settingKeys.privateIntegrationsQueueAdminUiEnabled,
    valueType: 'boolean',
    description: 'Enable the admin API for queue inspection and retry',
    isRequired: true,
    defaultValue: true,
  }),
];
