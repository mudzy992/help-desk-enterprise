import { Test } from '@nestjs/testing';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
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

  it('boots Redis infrastructure without HTTP, Prisma, or websocket', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    expect(moduleRef.get(RedisService)).toBeDefined();
    expect(() => moduleRef.get(PrismaService)).toThrow();
    expect(() => moduleRef.get(WebsocketGateway)).toThrow();
    await moduleRef.close();
  });
});
