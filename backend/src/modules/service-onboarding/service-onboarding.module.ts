import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { DefaultOnboardingApprovalsProvider } from './default-onboarding-approvals.provider';
import { DefaultOnboardingRoutingProvider } from './default-onboarding-routing.provider';
import { DefaultOnboardingSlaProvider } from './default-onboarding-sla.provider';
import { ServiceOnboardingConfigurationLoader } from './service-onboarding-configuration.loader';
import { ServiceOnboardingController } from './service-onboarding.controller';
import { ServiceOnboardingDomainStepsController } from './service-onboarding-domain-steps.controller';
import { ServiceOnboardingExecutor } from './service-onboarding.executor';
import { ServiceOnboardingService } from './service-onboarding.service';
import { ServiceOnboardingServiceFormStepsController } from './service-onboarding-service-form-steps.controller';
import { ServiceOnboardingStepsService } from './service-onboarding-steps.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    ServiceCatalogModule,
  ],
  controllers: [
    ServiceOnboardingController,
    ServiceOnboardingServiceFormStepsController,
    ServiceOnboardingDomainStepsController,
  ],
  providers: [
    ServiceOnboardingConfigurationLoader,
    DefaultOnboardingRoutingProvider,
    DefaultOnboardingSlaProvider,
    DefaultOnboardingApprovalsProvider,
    ServiceOnboardingExecutor,
    ServiceOnboardingService,
    ServiceOnboardingStepsService,
  ],
  exports: [ServiceOnboardingService, ServiceOnboardingStepsService],
})
export class ServiceOnboardingModule {}
