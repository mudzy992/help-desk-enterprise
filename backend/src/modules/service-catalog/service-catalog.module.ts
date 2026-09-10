import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ServiceCategoriesController } from './service-categories.controller';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceLifecycleConfigurationLoader } from './service-lifecycle-configuration.loader';
import { ServicesController } from './services.controller';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [ServiceCategoriesController, ServicesController],
  providers: [ServiceLifecycleConfigurationLoader, ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
