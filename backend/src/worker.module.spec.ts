import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { integrationQueueName } from './modules/integration-queue/integration-queue.constants';
import { IntegrationQueueProcessor } from './modules/integration-queue/integration-queue.processor';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';
import { WorkerModule } from './worker.module';

jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('WorkerModule', () => {
  beforeEach(() => {
    process.env.REDIS_HOST = 'redis-core';
    process.env.REDIS_PORT = '6379';
    process.env.QUEUE_PREFIX = 'bull:ephelpdesk';
  });

  it('boots Redis, Prisma, and the queue processor without HTTP or websocket', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    })
      .overrideProvider(getQueueToken(integrationQueueName))
      .useValue({
        add: jest.fn(),
        close: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        off: jest.fn(),
      })
      .overrideProvider(IntegrationQueueProcessor)
      .useValue({ process: async () => undefined })
      .compile();
    expect(moduleRef.get(RedisService)).toBeDefined();
    expect(moduleRef.get(PrismaService)).toBeDefined();
    expect(moduleRef.get(IntegrationQueueProcessor)).toBeDefined();
    expect(() => moduleRef.get(WebsocketGateway)).toThrow();
    await moduleRef.close();
  });
});
