import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { SlaCalendarsController } from './sla-calendars.controller';
import { SlaCalendarsService } from './sla-calendars.service';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { SlaProfilesController } from './sla-profiles.controller';
import { SlaProfilesService } from './sla-profiles.service';
import { SlaRulesController } from './sla-rules.controller';
import { SlaRulesService } from './sla-rules.service';
import { TicketSlaBreachScannerService } from './ticket-sla-breach-scanner.service';
import { TicketSlaTimersService } from './ticket-sla-timers.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
  ],
  controllers: [
    SlaCalendarsController,
    SlaProfilesController,
    SlaRulesController,
  ],
  providers: [
    SlaConfigurationLoader,
    SlaCalendarsService,
    SlaProfilesService,
    SlaRulesService,
    TicketSlaTimersService,
    TicketSlaBreachScannerService,
  ],
  exports: [
    SlaCalendarsService,
    SlaProfilesService,
    SlaRulesService,
    TicketSlaTimersService,
  ],
})
export class SlaModule {}
