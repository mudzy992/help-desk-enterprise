import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { integrationQueueName } from './modules/integration-queue/integration-queue.constants';
import { integrationWorkerMaintenanceQueueName } from './modules/integration-queue/integration-worker-maintenance.job.constants';
import { IntegrationWorkerMaintenanceProcessor } from './modules/integration-queue/integration-worker-maintenance.processor';
import { notificationRetentionQueueName } from './modules/notifications/notification-retention.constants';
import { NotificationRetentionProcessor } from './modules/notifications/notification-retention.processor';
import { IntegrationQueueProcessor } from './modules/integration-queue/integration-queue.processor';
import { knowledgeBaseReviewReminderQueueName } from './modules/knowledge-base/knowledge-base-review-reminder.job.constants';
import { KnowledgeBaseReviewReminderProcessor } from './modules/knowledge-base/knowledge-base-review-reminder.processor';
import { slaScanQueueName } from './modules/sla/sla-scan.constants';
import { SlaScanProcessor } from './modules/sla/sla-scan.processor';
import { ticketArchiveQueueName } from './modules/tickets/archive/ticket-archive.job.constants';
import { TicketArchiveProcessor } from './modules/tickets/archive/ticket-archive.processor';
import { timeTrackingSweepQueueName } from './modules/tickets/time-tracking/time-tracking-sweep.job.constants';
import { TimeTrackingSweepProcessor } from './modules/tickets/time-tracking/time-tracking-sweep.processor';
import { waitingForUserQueueName } from './modules/tickets/waiting-for-user/waiting-for-user.job.constants';
import { WaitingForUserProcessor } from './modules/tickets/waiting-for-user/waiting-for-user.processor';
import { WebsocketGateway } from './modules/websocket/websocket.gateway';
import { WorkerModule } from './worker.module';

jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/** Every queue the worker owns (Phase 2.1, 2.3 and 4.1). */
const scheduledQueueNames = [
  integrationQueueName,
  slaScanQueueName,
  notificationRetentionQueueName,
  ticketArchiveQueueName,
  waitingForUserQueueName,
  knowledgeBaseReviewReminderQueueName,
  integrationWorkerMaintenanceQueueName,
  timeTrackingSweepQueueName,
] as const;

const processorTypes = [
  IntegrationQueueProcessor,
  SlaScanProcessor,
  NotificationRetentionProcessor,
  TicketArchiveProcessor,
  WaitingForUserProcessor,
  KnowledgeBaseReviewReminderProcessor,
  IntegrationWorkerMaintenanceProcessor,
  TimeTrackingSweepProcessor,
] as const;

function createFakeQueue() {
  return {
    upsertJobScheduler: jest.fn().mockResolvedValue({}),
    add: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
}

describe('WorkerModule', () => {
  beforeEach(() => {
    process.env.REDIS_HOST = 'redis-core';
    process.env.REDIS_PORT = '6379';
    process.env.QUEUE_PREFIX = 'bull:ephelpdesk';
  });

  it('boots Redis, Prisma, and every scheduled job without HTTP or websocket', async () => {
    const builder = Test.createTestingModule({ imports: [WorkerModule] });
    for (const queueName of scheduledQueueNames) {
      builder
        .overrideProvider(getQueueToken(queueName))
        .useValue(createFakeQueue());
    }
    for (const processor of processorTypes) {
      builder.overrideProvider(processor).useValue({ process: async () => undefined });
    }
    const moduleRef = await builder.compile();

    expect(moduleRef.get(RedisService)).toBeDefined();
    expect(moduleRef.get(PrismaService)).toBeDefined();
    for (const processor of processorTypes) {
      expect(moduleRef.get(processor)).toBeDefined();
    }
    expect(() => moduleRef.get(WebsocketGateway)).toThrow();
    await moduleRef.close();
  });
});
