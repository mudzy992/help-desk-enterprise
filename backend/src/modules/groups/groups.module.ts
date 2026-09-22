import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketAssignmentConfigurationLoader } from '../tickets/assignment/ticket-assignment-configuration.loader';
import { GroupsController } from './groups.controller';
import { GroupsMineController } from './groups-mine.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  // GroupsMineController's fixed path `groups/mine` must be registered ahead
  // of GroupsController, whose `GET :groupId` would otherwise shadow it.
  controllers: [GroupsMineController, GroupsController],
  providers: [GroupsService, TicketAssignmentConfigurationLoader],
  exports: [GroupsService],
})
export class GroupsModule {}
