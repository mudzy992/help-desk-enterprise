import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { createFakeRedisClient } from '../../common/redis/create-fake-redis-client';
import { RedisModule } from '../../common/redis/redis.module';
import { redisTokens } from '../../common/redis/redis.tokens';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { RoleGuard } from '../authorization/role.guard';
import { SettingsController } from './settings.controller';
import { PublicSettingsController } from './public-settings.controller';
import { SettingsHttpModule } from './settings-http.module';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SettingsHttpModule', () => {
  it('resolves session authentication guard dependencies from AuthenticationModule', async () => {
    // Phase 2.2: the session guard resolves through the principal context loader,
    // so the module graph needs the global Redis module (client stubbed).
    process.env.REDIS_HOST = '127.0.0.1';
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, RedisModule, SettingsHttpModule],
    })
      .overrideProvider(redisTokens.client)
      .useValue(createFakeRedisClient())
      .compile();
    expect(moduleRef.get(SettingsController)).toBeDefined();
    expect(moduleRef.get(PublicSettingsController)).toBeDefined();
    expect(moduleRef.get(SessionAuthenticationGuard)).toBeDefined();
    expect(moduleRef.get(RoleGuard)).toBeDefined();
    await moduleRef.close();
  });
});
