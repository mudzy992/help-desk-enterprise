import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { DirectorySyncModule } from './modules/directory-sync/directory-sync.module';
import { OrganizationalUnitsModule } from './modules/organizational-units/organizational-units.module';
import { PolicyPacksModule } from './modules/policy-packs/policy-packs.module';
import { RoutingModule } from './modules/routing/routing.module';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module';
import { ServiceOnboardingModule } from './modules/service-onboarding/service-onboarding.module';
import { SettingsHttpModule } from './modules/settings/settings-http.module';
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
    SettingsHttpModule,
    AuthenticationModule,
    AuthorizationModule,
    DirectorySyncModule,
    OrganizationalUnitsModule,
    PolicyPacksModule,
    RoutingModule,
    ServiceCatalogModule,
    ServiceOnboardingModule,
    WebsocketModule,
  ],
})
export class AppModule {}
