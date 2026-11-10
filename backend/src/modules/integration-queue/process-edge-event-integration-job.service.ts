import { Injectable } from '@nestjs/common';
import {
  parseEdgeEventIntegrationJobPayload,
  toEdgeEventRealtimePublish,
} from './parse-edge-event-integration-job-payload';
import { PublishEdgeEventToRedisService } from './publish-edge-event-to-redis.service';

@Injectable()
export class ProcessEdgeEventIntegrationJobService {
  constructor(
    private readonly publishEdgeEventToRedisService: PublishEdgeEventToRedisService,
  ) {}

  async process(payload: unknown): Promise<void> {
    const edgePayload = parseEdgeEventIntegrationJobPayload(payload);
    if (edgePayload === null) {
      throw new Error('Invalid EDGE_EVENT integration job payload');
    }
    await this.publishEdgeEventToRedisService.publish(
      toEdgeEventRealtimePublish(edgePayload),
    );
  }
}
