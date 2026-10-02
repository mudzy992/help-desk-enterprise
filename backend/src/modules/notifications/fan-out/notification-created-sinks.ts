import { Logger } from '@nestjs/common';
import type { NotificationRecord } from '../notifications.types';

/**
 * Paket 3.1: extra delivery channels (Teams) observe every in-app notification
 * that was actually written — personal or group, from any module — without the
 * 30-odd producers knowing about them. Sinks run after the write, never block
 * it and never throw into it.
 */
export type NotificationCreatedSink = (records: readonly NotificationRecord[]) => Promise<void>;

const sinks = new Set<NotificationCreatedSink>();
const logger = new Logger('NotificationCreatedSinks');

export function registerNotificationCreatedSink(sink: NotificationCreatedSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

export function emitNotificationsCreated(records: readonly (NotificationRecord | null)[]): void {
  const created = records.filter((record): record is NotificationRecord => record !== null);
  if (created.length === 0 || sinks.size === 0) return;
  for (const sink of sinks) {
    void sink(created).catch((error: unknown) => {
      logger.warn(`notification_sink_failed reason=${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
