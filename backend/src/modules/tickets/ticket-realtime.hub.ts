import { Injectable, Logger } from '@nestjs/common';
import type { TicketRealtimeMessagePayload } from './collaboration.types';
import type {
  GroupNotificationRealtimePublish,
  NotificationRealtimePublish,
} from '../notifications/notification-realtime.types';
import type {
  AnnouncementChangedRealtimePayload,
  EdgeEventRealtimePublish,
  TicketUpdatedRealtimePayload,
} from './ticket-realtime.types';

type TicketMessageListener = (payload: TicketRealtimeMessagePayload) => void;
type AwaitedTicketMessageListener = (payload: TicketRealtimeMessagePayload) => void | Promise<void>;
type TicketUpdatedListener = (payload: TicketUpdatedRealtimePayload) => void;
type AwaitedTicketUpdatedListener = (payload: TicketUpdatedRealtimePayload) => void | Promise<void>;
type NotificationListener = (payload: NotificationRealtimePublish) => void;
type AnnouncementChangedListener = (payload: AnnouncementChangedRealtimePayload) => void | Promise<void>;
type EdgeEventListener = (payload: EdgeEventRealtimePublish) => void;
type GroupNotificationListener = (payload: GroupNotificationRealtimePublish) => void;

const ticketUpdatePublicationRetentionMs = 24 * 60 * 60 * 1_000;
const maxRememberedTicketUpdatePublications = 10_000;

@Injectable()
export class TicketRealtimeHub {
  private readonly logger = new Logger(TicketRealtimeHub.name);
  private readonly messageListeners = new Set<AwaitedTicketMessageListener>();
  private readonly ticketUpdatedListeners = new Set<AwaitedTicketUpdatedListener>();
  private readonly notificationListeners = new Set<NotificationListener>();
  private readonly announcementChangedListeners = new Set<AnnouncementChangedListener>();
  private readonly edgeEventListeners = new Set<EdgeEventListener>();
  private readonly groupNotificationListeners = new Set<GroupNotificationListener>();
  private readonly pendingTicketUpdatePublications = new Map<string, Promise<void>>();
  private readonly completedTicketUpdatePublications = new Map<string, number>();

  subscribeGroupNotification(listener: GroupNotificationListener): () => void {
    this.groupNotificationListeners.add(listener);
    return () => {
      this.groupNotificationListeners.delete(listener);
    };
  }

  publishGroupNotification(payload: GroupNotificationRealtimePublish): void {
    for (const listener of this.groupNotificationListeners) {
      listener(payload);
    }
  }

  subscribe(listener: TicketMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  subscribeAwaited(listener: AwaitedTicketMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  subscribeTicketUpdated(listener: TicketUpdatedListener): () => void {
    this.ticketUpdatedListeners.add(listener);
    return () => {
      this.ticketUpdatedListeners.delete(listener);
    };
  }

  subscribeTicketUpdatedAwaited(listener: AwaitedTicketUpdatedListener): () => void {
    this.ticketUpdatedListeners.add(listener);
    return () => {
      this.ticketUpdatedListeners.delete(listener);
    };
  }

  subscribeAnnouncementChanged(listener: AnnouncementChangedListener): () => void {
    this.announcementChangedListeners.add(listener);
    return () => {
      this.announcementChangedListeners.delete(listener);
    };
  }

  subscribeNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  subscribeEdgeEvent(listener: EdgeEventListener): () => void {
    this.edgeEventListeners.add(listener);
    return () => {
      this.edgeEventListeners.delete(listener);
    };
  }

  /** Fast best-effort path; durable message outbox delivery retries failures. */
  publish(payload: TicketRealtimeMessagePayload): void {
    this.publishBestEffort(this.messageListeners, payload, 'message');
  }

  /**
   * Reliable worker path. The outbox marks its message delivered only after
   * every listener completes; a rejected bridge publish remains retryable.
   */
  async publishAwaited(payload: TicketRealtimeMessagePayload): Promise<void> {
    await this.publishAwaitedToListeners(this.messageListeners, payload, 'message');
  }

  /** Fast best-effort path; durable message outbox delivery retries failures. */
  publishTicketUpdated(payload: TicketUpdatedRealtimePayload): void {
    this.publishBestEffort(this.ticketUpdatedListeners, payload, 'ticket-updated');
  }

  /** Reliable worker path for the ticket.updated projection of a system event. */
  async publishTicketUpdatedAwaited(payload: TicketUpdatedRealtimePayload): Promise<void> {
    await this.publishAwaitedToListeners(this.ticketUpdatedListeners, payload, 'ticket-updated');
  }

  /**
   * Idempotent awaited projection for the durable message outbox: if the update
   * delivered but its paired message failed, an outbox retry must not repeat a
   * successful update publication. Failures remain retryable. Dedupe is bounded
   * and process-local; it is not a durable or cross-instance exactly-once claim.
   */
  async publishTicketUpdatedAwaitedOnce(
    payload: TicketUpdatedRealtimePayload,
  ): Promise<void> {
    if (payload.sourceMessageId === null) {
      await this.publishTicketUpdatedAwaited(payload);
      return;
    }
    const key = `${payload.ticketId}\u0000${payload.sourceMessageId}`;
    const now = Date.now();
    this.pruneCompletedTicketUpdates(now);
    if (this.completedTicketUpdatePublications.has(key)) {
      return;
    }
    const pending = this.pendingTicketUpdatePublications.get(key);
    if (pending !== undefined) {
      await pending;
      return;
    }
    const publication = this.publishTicketUpdatedAwaited(payload);
    this.pendingTicketUpdatePublications.set(key, publication);
    try {
      await publication;
      this.completedTicketUpdatePublications.set(key, Date.now());
      this.pruneCompletedTicketUpdates(Date.now());
    } finally {
      if (this.pendingTicketUpdatePublications.get(key) === publication) {
        this.pendingTicketUpdatePublications.delete(key);
      }
    }
  }

  /** Best-effort in-process; the worker forwarder awaits the same listener before acking its bridge write. */
  publishAnnouncementChanged(payload: AnnouncementChangedRealtimePayload): void {
    this.publishBestEffort(this.announcementChangedListeners, payload, 'announcement-changed');
  }

  async publishAnnouncementChangedAwaited(payload: AnnouncementChangedRealtimePayload): Promise<void> {
    await this.publishAwaitedToListeners(this.announcementChangedListeners, payload, 'announcement-changed');
  }

  publishNotification(payload: NotificationRealtimePublish): void {
    for (const listener of this.notificationListeners) {
      listener(payload);
    }
  }

  publishEdgeEvent(payload: EdgeEventRealtimePublish): void {
    for (const listener of this.edgeEventListeners) {
      listener(payload);
    }
  }

  private pruneCompletedTicketUpdates(now: number): void {
    for (const [key, completedAt] of this.completedTicketUpdatePublications) {
      if (now - completedAt <= ticketUpdatePublicationRetentionMs) {
        break;
      }
      this.completedTicketUpdatePublications.delete(key);
    }
    while (
      this.completedTicketUpdatePublications.size >
      maxRememberedTicketUpdatePublications
    ) {
      const oldest = this.completedTicketUpdatePublications.keys().next().value;
      if (oldest === undefined) {
        return;
      }
      this.completedTicketUpdatePublications.delete(oldest);
    }
  }

  private publishBestEffort<T>(
    listeners: ReadonlySet<(payload: T) => void | Promise<void>>,
    payload: T,
    channel: string,
  ): void {
    for (const listener of listeners) {
      try {
        const result = listener(payload);
        if (isPromiseLike(result)) {
          void result.catch((error: unknown) => this.logPublishFailure(channel, error));
        }
      } catch (error) {
        this.logPublishFailure(channel, error);
      }
    }
  }

  private async publishAwaitedToListeners<T>(
    listeners: ReadonlySet<(payload: T) => void | Promise<void>>,
    payload: T,
    channel: string,
  ): Promise<void> {
    if (listeners.size === 0) {
      throw new Error(`TICKET_REALTIME_NO_LISTENERS:${channel}`);
    }
    await Promise.all([...listeners].map((listener) => listener(payload)));
  }

  private logPublishFailure(channel: string, error: unknown): void {
    this.logger.warn(
      `ticket_realtime_publish_failed channel=${channel} reason=${errorText(error)}`,
    );
  }
}

function isPromiseLike(value: void | Promise<void>): value is Promise<void> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}
