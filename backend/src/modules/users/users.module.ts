import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [UsersController],
  providers: [UsersService, SmtpMailTransport],
  exports: [UsersService],
})
export class UsersModule {}
