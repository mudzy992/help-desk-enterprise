import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationsFanOutService } from './fan-out/notifications-fan-out.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, TicketsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsFanOutService],
})
export class NotificationsModule {}
