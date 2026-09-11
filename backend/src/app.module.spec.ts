import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

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
    }).compile();
    await moduleRef.close();
  });
});
