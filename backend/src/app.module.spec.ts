import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { integrationQueueName } from './modules/integration-queue/integration-queue.constants';
import { KnowledgeBaseReviewReminderService } from './modules/knowledge-base/knowledge-base-review-reminder.service';
import { TicketArchiveAutomationService } from './modules/tickets/archive/ticket-archive-automation.service';
import { TicketRealtimeBridgeSubscriber } from './modules/tickets/ticket-realtime-bridge.subscriber';
import { WaitingForUserAutomationService } from './modules/tickets/waiting-for-user/waiting-for-user-automation.service';

jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {
    async onModuleInit(): Promise<void> {}
    async onModuleDestroy(): Promise<void> {}
  },
}));

async function compileAppModule() {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.DATABASE_URL = 'postgresql://user:pass@127.0.0.1:5432/ephelpdesk';
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getQueueToken(integrationQueueName))
    .useValue(createFakeIntegrationQueue())
    .compile();
}

describe('AppModule', () => {
  it('compiles session authentication injectables for HTTP modules', async () => {
    const moduleRef = await compileAppModule();
    await moduleRef.close();
  });

  /**
   * Phase 4.1 (plan §4.1): "the API process must not run periodic jobs". The strongest
   * form of that guarantee a unit test can give is that the job classes are not even
   * part of the API module graph — the API cannot start a sweep it does not have.
   */
  it('does not provide the periodic job classes', async () => {
    const moduleRef = await compileAppModule();
    for (const jobClass of [
      TicketArchiveAutomationService,
      WaitingForUserAutomationService,
      KnowledgeBaseReviewReminderService,
    ]) {
      expect(() => moduleRef.get(jobClass, { strict: false })).toThrow();
    }
    // ...while the API does keep the receiving end of the worker's realtime bridge,
    // otherwise the sweeps would publish into the void.
    expect(
      moduleRef.get(TicketRealtimeBridgeSubscriber, { strict: false }),
    ).toBeDefined();
    await moduleRef.close();
  });
});

function createFakeIntegrationQueue() {
  return {
    add: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
}
