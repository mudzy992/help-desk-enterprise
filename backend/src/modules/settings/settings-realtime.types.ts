import type { SettingVisibility } from './settings.types';

export const settingsRealtimeEventNames = {
  privateMetadataUpdated: 'settings.private-metadata.updated',
} as const;

export type SettingsUpdatedRealtimePayload = {
  readonly key: string;
  readonly visibility: SettingVisibility;
  readonly occurredAt: string;
  readonly invalidatesSession: boolean;
};

export type SessionInvalidatedRealtimePayload = {
  readonly occurredAt: string;
};
