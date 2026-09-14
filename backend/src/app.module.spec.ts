import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { integrationQueueName } from './modules/integration-queue/integration-queue.constants';

jest.mock('./common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {
    async onModuleInit(): Promise<void> {}
    async onModuleDestroy(): Promise<void> {}
  },
}));

describe('AppModule', () => {
  it('compiles session authentication injectables for HTTP modules', async () => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.DATABASE_URL =
      'postgresql://user:pass@127.0.0.1:5432/ephelpdesk';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getQueueToken(integrationQueueName))
      .useValue(createFakeIntegrationQueue())
      .compile();
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
