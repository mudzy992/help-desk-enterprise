import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mapServiceCatalogError } from '../service-catalog/map-service-catalog-error';
import { mapServiceFormsError } from '../service-catalog/map-service-forms-error';
import { ServiceCatalogError } from '../service-catalog/service-catalog.error';
import { ServiceFormsError } from '../service-catalog/service-forms.error';
import { ServiceLifecycleConfigurationLoader } from '../service-catalog/service-lifecycle-configuration.loader';
import { DefaultOnboardingApprovalsProvider } from './default-onboarding-approvals.provider';
import { DefaultOnboardingRoutingProvider } from './default-onboarding-routing.provider';
import { DefaultOnboardingSlaProvider } from './default-onboarding-sla.provider';
import { getServiceOnboarding } from './get-service-onboarding';
import { mapServiceOnboardingError } from './map-service-onboarding-error';
import { ServiceOnboardingConfigurationLoader } from './service-onboarding-configuration.loader';
import { ServiceOnboardingError } from './service-onboarding.error';
import type {
  OnboardingMutationContext,
  ServiceOnboardingRecord,
  ServiceOnboardingResponse,
} from './service-onboarding.types';
import type { OnboardingDomainProviders } from './validate-onboarding-steps';

@Injectable()
export class ServiceOnboardingExecutor {
  constructor(
    readonly prisma: PrismaService,
    readonly onboardingConfigurationLoader: ServiceOnboardingConfigurationLoader,
    readonly lifecycleConfigurationLoader: ServiceLifecycleConfigurationLoader,
    readonly routingProvider: DefaultOnboardingRoutingProvider,
    readonly slaProvider: DefaultOnboardingSlaProvider,
    readonly approvalsProvider: DefaultOnboardingApprovalsProvider,
  ) {}

  providers(): OnboardingDomainProviders {
    return {
      routing: this.routingProvider,
      sla: this.slaProvider,
      approvals: this.approvalsProvider,
    };
  }

  async respond(
    record: ServiceOnboardingRecord,
  ): Promise<ServiceOnboardingResponse> {
    return getServiceOnboarding(
      this.prisma,
      record.serviceId,
      await this.onboardingConfigurationLoader.load(),
      this.routingProvider,
    );
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ServiceOnboardingError) {
        throw mapServiceOnboardingError(error);
      }
      if (error instanceof ServiceCatalogError) {
        throw mapServiceCatalogError(error);
      }
      if (error instanceof ServiceFormsError) {
        throw mapServiceFormsError(error);
      }
      throw error;
    }
  }
}

export const emptyOnboardingContext: OnboardingMutationContext = {
  actorUserId: null,
};
