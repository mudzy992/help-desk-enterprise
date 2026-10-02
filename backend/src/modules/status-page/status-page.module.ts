import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ServiceAvailabilityConfigurationLoader } from '../service-catalog/service-availability-configuration.loader';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PublicStatusPageController } from './public-status-page.controller';
import { StatusIncidentsService } from './status-incidents.service';
import { StatusPageConfigurationLoader } from './status-page.configuration';
import { StatusPageController } from './status-page.controller';
import { StatusPageService } from './status-page.service';

/** Paket 2.7 (§8): status page, incidents and their links to tickets. */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, TicketsModule],
  controllers: [StatusPageController, PublicStatusPageController],
  providers: [StatusPageConfigurationLoader, ServiceAvailabilityConfigurationLoader, StatusPageService, StatusIncidentsService],
  exports: [StatusPageService],
})
export class StatusPageModule {}
