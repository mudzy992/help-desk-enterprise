import { Injectable } from '@nestjs/common';
import { IntegrationJobStatus } from '../../generated/prisma/enums';
import {
  parseEdgeEventIntegrationJobPayload,
  toEdgeEventRealtimePublish,
} from './parse-edge-event-integration-job-payload';
import { PublishEdgeEventToRedisService } from './publish-edge-event-to-redis.service';

export const edgeEventNoSubscribersCode = 'EDGE_EVENT_NO_SUBSCRIBERS';

export class EdgeEventNoSubscribersError extends Error {
  readonly code = edgeEventNoSubscribersCode;

  constructor() {
    super(edgeEventNoSubscribersCode);
    this.name = 'EdgeEventNoSubscribersError';
  }
}

@Injectable()
export class ProcessEdgeEventIntegrationJobService {
  constructor(
    private readonly publishEdgeEventToRedisService: PublishEdgeEventToRedisService,
  ) {}

  async process(
    payload: unknown,
  ): Promise<typeof IntegrationJobStatus.PUBLISHED_BEST_EFFORT> {
    const edgePayload = parseEdgeEventIntegrationJobPayload(payload);
    if (edgePayload === null) {
      throw new Error('Invalid EDGE_EVENT integration job payload');
    }
    const subscriberCount = await this.publishEdgeEventToRedisService.publish(
      toEdgeEventRealtimePublish(edgePayload),
    );
    if (subscriberCount <= 0) {
      throw new EdgeEventNoSubscribersError();
    }
    // Redis Pub/Sub confirms only that one or more subscriptions received the
    // publication. It is not an acknowledgement that an API client delivered it.
    return IntegrationJobStatus.PUBLISHED_BEST_EFFORT;
  }
}
