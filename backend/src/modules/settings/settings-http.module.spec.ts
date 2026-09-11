import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { RoleGuard } from '../authorization/role.guard';
import { SettingsController } from './settings.controller';
import { SettingsHttpModule } from './settings-http.module';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SettingsHttpModule', () => {
  it('resolves session authentication guard dependencies from AuthenticationModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, SettingsHttpModule],
    }).compile();
    expect(moduleRef.get(SettingsController)).toBeDefined();
    expect(moduleRef.get(SessionAuthenticationGuard)).toBeDefined();
    expect(moduleRef.get(RoleGuard)).toBeDefined();
    await moduleRef.close();
  });
});
