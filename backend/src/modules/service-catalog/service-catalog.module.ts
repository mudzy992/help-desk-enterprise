import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
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

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
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
    ServiceCatalogService,
    ServiceAvailabilityService,
    ServiceFormsService,
  ],
  exports: [
    ServiceCatalogService,
    ServiceAvailabilityService,
    ServiceFormsService,
  ],
})
export class ServiceCatalogModule {}
