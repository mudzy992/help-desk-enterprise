import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PublicSettingsController } from './public-settings.controller';
import { SettingsController } from './settings.controller';
import { SettingsModule } from './settings.module';

@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [SettingsController, PublicSettingsController],
})
export class SettingsHttpModule {}
