import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { InboundEmailAdminController } from './inbound-email-admin.controller';
import { InboundEmailAdminService } from './inbound-email-admin.service';

/** Paket 2.3: API side of reply by e-mail (status + connection test only). */
@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [InboundEmailAdminController],
  providers: [InboundEmailAdminService],
})
export class InboundEmailAdminModule {}
