import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DirectorySyncModule } from '../directory-sync/directory-sync.module';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { UsersController } from './users.controller';
import { UserPreferencesController } from './user-preferences.controller';
import { UserDirectoryIdentityController } from './user-directory-identity.controller';
import { UsersService } from './users.service';
import { TemporaryPasswordDeliveryDispatcher } from './temporary-password-delivery.dispatcher';
import { UserSecurityController } from './user-security.controller';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    DirectorySyncModule,
  ],
  // The static `me/preferences` path registers before the `:userId` routes.
  controllers: [UserPreferencesController, UsersController, UserDirectoryIdentityController, UserSecurityController],
  providers: [
    UsersService,
    SmtpMailTransport,
    // W2.26 (`BA-users-02`): delivers the temporary password of accounts created on
    // the e-mail channel out of the durable intent the create transaction commits.
    TemporaryPasswordDeliveryDispatcher,
  ],
  exports: [UsersService],
})
export class UsersModule {}
