import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoutingModule } from '../routing/routing.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { SettingsModule } from '../settings/settings.module';
import { DefaultOnboardingApprovalsProvider } from './default-onboarding-approvals.provider';
import { DefaultOnboardingSlaProvider } from './default-onboarding-sla.provider';
import { PersistedOnboardingRoutingProvider } from './persisted-onboarding-routing.provider';
import { SERVICE_ONBOARDING_ROUTING_PROVIDER } from './service-onboarding.constants';
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
    RoutingModule,
  ],
  controllers: [
    ServiceOnboardingController,
    ServiceOnboardingServiceFormStepsController,
    ServiceOnboardingDomainStepsController,
  ],
  providers: [
    ServiceOnboardingConfigurationLoader,
    PersistedOnboardingRoutingProvider,
    {
      provide: SERVICE_ONBOARDING_ROUTING_PROVIDER,
      useExisting: PersistedOnboardingRoutingProvider,
    },
    DefaultOnboardingSlaProvider,
    DefaultOnboardingApprovalsProvider,
    ServiceOnboardingExecutor,
    ServiceOnboardingService,
    ServiceOnboardingStepsService,
  ],
  exports: [ServiceOnboardingService, ServiceOnboardingStepsService],
})
export class ServiceOnboardingModule {}
