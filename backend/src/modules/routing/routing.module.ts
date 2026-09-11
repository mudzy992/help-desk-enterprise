import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { RoutingConfigurationLoader } from './routing-configuration.loader';
import { RoutingController } from './routing.controller';
import { RoutingService } from './routing.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [RoutingController],
  providers: [RoutingConfigurationLoader, RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
