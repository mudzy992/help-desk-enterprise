import { Module, forwardRef } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoutingModule } from '../routing/routing.module';
import { SettingsModule } from '../settings/settings.module';
import { ServiceAvailabilityConfigurationLoader } from './service-availability-configuration.loader';
import { ServiceAvailabilityController } from './service-availability.controller';
import { ServiceAvailabilityService } from './service-availability.service';
import { ServiceCategoriesController } from './service-categories.controller';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceFormsConfigurationLoader } from './service-forms-configuration.loader';
import { ServiceFormsController } from './service-forms.controller';
import { ServiceFormsService } from './service-forms.service';
import { ServiceLifecycleConfigurationLoader } from './service-lifecycle-configuration.loader';
import { ServicesController } from './services.controller';
import { TicketApprovalsConfigurationLoader } from '../tickets/approvals/ticket-approvals-configuration.loader';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    forwardRef(() => RoutingModule),
  ],
  controllers: [
    ServiceCategoriesController,
    ServicesController,
    ServiceAvailabilityController,
    ServiceFormsController,
  ],
  providers: [
    ServiceLifecycleConfigurationLoader,
    ServiceAvailabilityConfigurationLoader,
    ServiceFormsConfigurationLoader,
    // Provided here too (already provided in TicketsModule): approvalSteps on
    // ServiceResponse needs it and there is no dependency from tickets to
    // service-catalog, so each module gets its own stateless instance.
    TicketApprovalsConfigurationLoader,
    ServiceCatalogService,
    ServiceAvailabilityService,
    ServiceFormsService,
  ],
  exports: [
    ServiceCatalogService,
    ServiceAvailabilityService,
    ServiceFormsService,
    ServiceLifecycleConfigurationLoader,
    ServiceFormsConfigurationLoader,
  ],
})
export class ServiceCatalogModule {}
