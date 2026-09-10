import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { DirectorySyncModule } from './modules/directory-sync/directory-sync.module';
import { OrganizationalUnitsModule } from './modules/organizational-units/organizational-units.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    RedisModule,
    SettingsModule,
    AuthenticationModule,
    DirectorySyncModule,
    OrganizationalUnitsModule,
    WebsocketModule,
  ],
})
export class AppModule {}
