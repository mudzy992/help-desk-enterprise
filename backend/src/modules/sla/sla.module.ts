import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { SlaCalendarsController } from './sla-calendars.controller';
import { SlaCalendarsService } from './sla-calendars.service';
import { SlaComplianceController } from './sla-compliance.controller';
import { SlaComplianceService } from './sla-compliance.service';
import { SlaConfigurationLoader } from './sla-configuration.loader';
import { SlaGlobalAdministrationGuard } from './sla-global-administration.guard';
import { PriorityMatrixController } from './priority-matrix.controller';
import { PriorityMatrixService } from './priority-matrix.service';
import { SlaEscalationRulesController } from './sla-escalation-rules.controller';
import { SlaEscalationRulesService } from './sla-escalation-rules.service';
import { SlaProfilesController } from './sla-profiles.controller';
import { SlaProfilesService } from './sla-profiles.service';
import { SlaRulesController } from './sla-rules.controller';
import { SlaRulesService } from './sla-rules.service';
import { StartingSlaSeedService } from './starting-sla-seed.service';
import { TicketSlaTimersService } from './ticket-sla-timers.service';
import { SlaTimerConfigurationMigrationController } from './sla-timer-configuration-migration.controller';
import { SlaTimerConfigurationMigrationService } from './sla-timer-configuration-migration.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
  ],
  controllers: [
    SlaCalendarsController,
    SlaProfilesController,
    SlaRulesController,
    SlaEscalationRulesController,
    PriorityMatrixController,
    SlaComplianceController,
    SlaTimerConfigurationMigrationController,
  ],
  providers: [
    SlaGlobalAdministrationGuard,
    SlaConfigurationLoader,
    SlaCalendarsService,
    SlaProfilesService,
    SlaRulesService,
    SlaEscalationRulesService,
    PriorityMatrixService,
    SlaComplianceService,
    TicketSlaTimersService,
    SlaTimerConfigurationMigrationService,
    StartingSlaSeedService,
  ],
  exports: [
    SlaCalendarsService,
    SlaProfilesService,
    SlaRulesService,
    SlaEscalationRulesService,
    PriorityMatrixService,
    SlaComplianceService,
    TicketSlaTimersService,
  ],
})
export class SlaModule {}
