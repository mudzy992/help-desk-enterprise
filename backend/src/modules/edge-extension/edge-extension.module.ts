import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { EdgeExtensionController } from './edge-extension.controller';
import { EdgeExtensionService } from './edge-extension.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [EdgeExtensionController],
  providers: [EdgeExtensionService],
})
export class EdgeExtensionModule {}
