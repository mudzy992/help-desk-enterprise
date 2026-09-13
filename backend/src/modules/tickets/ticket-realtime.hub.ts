import { Injectable } from '@nestjs/common';
import type { TicketRealtimeMessagePayload } from './collaboration.types';
import type { NotificationRealtimePublish } from '../notifications/notification-realtime.types';
import type { TicketUpdatedRealtimePayload } from './ticket-realtime.types';

type TicketMessageListener = (payload: TicketRealtimeMessagePayload) => void;
type TicketUpdatedListener = (payload: TicketUpdatedRealtimePayload) => void;
type NotificationListener = (payload: NotificationRealtimePublish) => void;

@Injectable()
export class TicketRealtimeHub {
  private readonly messageListeners = new Set<TicketMessageListener>();
  private readonly ticketUpdatedListeners = new Set<TicketUpdatedListener>();
  private readonly notificationListeners = new Set<NotificationListener>();

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
}
