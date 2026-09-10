import { Injectable } from '@nestjs/common';
import {
  abandonServiceOnboarding,
  resumeServiceOnboarding,
} from './abandon-resume-service-onboarding';
import { createServiceOnboarding } from './create-service-onboarding';
import { finalizeServiceOnboarding } from './finalize-service-onboarding';
import { getServiceOnboarding } from './get-service-onboarding';
import {
  emptyOnboardingContext,
  ServiceOnboardingExecutor,
} from './service-onboarding.executor';
import { startServiceOnboarding } from './start-service-onboarding';
import type {
  CreateServiceOnboardingInput,
  OnboardingMutationContext,
  ServiceOnboardingResponse,
} from './service-onboarding.types';

@Injectable()
export class ServiceOnboardingService {
  constructor(private readonly executor: ServiceOnboardingExecutor) {}

  create(
    input: CreateServiceOnboardingInput,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () => {
      const record = await createServiceOnboarding(
        this.executor.prisma,
        input,
        await this.executor.onboardingConfigurationLoader.load(),
        await this.executor.lifecycleConfigurationLoader.load(),
        context,
      );
      return this.executor.respond(record);
    });
  }

  start(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () => {
      const record = await startServiceOnboarding(
        this.executor.prisma,
        serviceId,
        await this.executor.onboardingConfigurationLoader.load(),
        context,
      );
      return this.executor.respond(record);
    });
  }

  getByServiceId(serviceId: string): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      getServiceOnboarding(
        this.executor.prisma,
        serviceId,
        await this.executor.onboardingConfigurationLoader.load(),
        this.executor.routingProvider,
      ),
    );
  }

  finalize(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await finalizeServiceOnboarding(
          this.executor.prisma,
          serviceId,
          await this.executor.onboardingConfigurationLoader.load(),
          await this.executor.lifecycleConfigurationLoader.load(),
          this.executor.providers(),
          context,
        ),
      ),
    );
  }

  abandon(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await abandonServiceOnboarding(
          this.executor.prisma,
          serviceId,
          await this.executor.onboardingConfigurationLoader.load(),
          context,
        ),
      ),
    );
  }

  resume(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await resumeServiceOnboarding(
          this.executor.prisma,
          serviceId,
          await this.executor.onboardingConfigurationLoader.load(),
          context,
        ),
      ),
    );
  }
}
