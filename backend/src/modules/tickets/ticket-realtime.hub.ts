import { Injectable } from '@nestjs/common';
import type { TicketRealtimeMessagePayload } from './collaboration.types';
import type {
  GroupNotificationRealtimePublish,
  NotificationRealtimePublish,
} from '../notifications/notification-realtime.types';
import type {
  EdgeEventRealtimePublish,
  TicketUpdatedRealtimePayload,
} from './ticket-realtime.types';

type TicketMessageListener = (payload: TicketRealtimeMessagePayload) => void;
type TicketUpdatedListener = (payload: TicketUpdatedRealtimePayload) => void;
type NotificationListener = (payload: NotificationRealtimePublish) => void;
type EdgeEventListener = (payload: EdgeEventRealtimePublish) => void;
type GroupNotificationListener = (
  payload: GroupNotificationRealtimePublish,
) => void;

@Injectable()
export class TicketRealtimeHub {
  private readonly messageListeners = new Set<TicketMessageListener>();
  private readonly ticketUpdatedListeners = new Set<TicketUpdatedListener>();
  private readonly notificationListeners = new Set<NotificationListener>();
  private readonly edgeEventListeners = new Set<EdgeEventListener>();
  private readonly groupNotificationListeners =
    new Set<GroupNotificationListener>();

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

  subscribeTicketUpdated(listener: TicketUpdatedListener): () => void {
    this.ticketUpdatedListeners.add(listener);
    return () => {
      this.ticketUpdatedListeners.delete(listener);
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

  publish(payload: TicketRealtimeMessagePayload): void {
    for (const listener of this.messageListeners) {
      listener(payload);
    }
  }

  publishTicketUpdated(payload: TicketUpdatedRealtimePayload): void {
    for (const listener of this.ticketUpdatedListeners) {
      listener(payload);
    }
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
}
