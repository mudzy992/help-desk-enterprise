import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { TicketsModule } from '../tickets/tickets.module';

/** Paket 2.9 (K2): announcements with read acknowledgement. */
@Module({
  // BA-announcements-20: TicketsModule exports the shared TicketRealtimeHub.
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, TicketsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
