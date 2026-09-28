import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { PrivacyIdentityConfirmer } from './privacy-identity-confirmer';
import { PrivacyController } from './privacy.controller';
import { privacyCoreProviders } from './privacy.providers';

/** Paket 2.6: privacy module (API side). */
@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [PrivacyController],
  providers: [...privacyCoreProviders, PrivacyIdentityConfirmer],
})
export class PrivacyModule {}
