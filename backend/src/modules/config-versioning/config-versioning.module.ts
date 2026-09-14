import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ConfigVersioningConfigurationLoader } from './config-versioning-configuration.loader';
import { ConfigVersioningController } from './config-versioning.controller';
import { ConfigVersioningRepository } from './config-versioning.repository';
import { ConfigVersioningService } from './config-versioning.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [ConfigVersioningController],
  providers: [
    ConfigVersioningConfigurationLoader,
    ConfigVersioningRepository,
    ConfigVersioningService,
  ],
  exports: [ConfigVersioningService],
})
export class ConfigVersioningModule {}
