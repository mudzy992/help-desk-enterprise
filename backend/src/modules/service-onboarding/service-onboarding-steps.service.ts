import { Injectable } from '@nestjs/common';
import { OptimisticConcurrencyService } from '../../common/optimistic-concurrency/optimistic-concurrency.service';
import type { ServiceOnboardingStep } from '../../generated/prisma/enums';
import { completeOnboardingStep } from './complete-onboarding-step';
import {
  saveOnboardingApprovalsStep,
  saveOnboardingRoutingStep,
  saveOnboardingSlaStep,
} from './save-onboarding-configuration-steps';
import {
  saveOnboardingFormStep,
  saveOnboardingServiceStep,
} from './save-onboarding-service-form-steps';
import {
  emptyOnboardingContext,
  ServiceOnboardingExecutor,
} from './service-onboarding.executor';
import type {
  OnboardingMutationContext,
  SaveOnboardingApprovalsStepInput,
  SaveOnboardingFormStepInput,
  SaveOnboardingRoutingStepInput,
  SaveOnboardingServiceStepInput,
  SaveOnboardingSlaStepInput,
  ServiceOnboardingResponse,
} from './service-onboarding.types';

@Injectable()
export class ServiceOnboardingStepsService {
  constructor(
    private readonly executor: ServiceOnboardingExecutor,
    private readonly optimisticConcurrency: OptimisticConcurrencyService = new OptimisticConcurrencyService(),
  ) {}

  saveServiceStep(
    serviceId: string,
    input: SaveOnboardingServiceStepInput,
    ifMatch: string | string[] | undefined,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await saveOnboardingServiceStep(
          this.executor.prisma,
          serviceId,
          input,
          ifMatch,
          await this.executor.onboardingConfigurationLoader.load(),
          context,
          this.optimisticConcurrency,
        ),
      ),
    );
  }

  saveFormStep(
    serviceId: string,
    input: SaveOnboardingFormStepInput,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await saveOnboardingFormStep(
          this.executor.prisma,
          serviceId,
          input,
          await this.executor.onboardingConfigurationLoader.load(),
          context,
        ),
      ),
    );
  }

  saveRoutingStep(
    serviceId: string,
    input: SaveOnboardingRoutingStepInput,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await saveOnboardingRoutingStep(
          this.executor.prisma,
          serviceId,
          input,
          await this.executor.onboardingConfigurationLoader.load(),
          this.executor.providers(),
          context,
        ),
      ),
    );
  }

  saveSlaStep(
    serviceId: string,
    input: SaveOnboardingSlaStepInput,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await saveOnboardingSlaStep(
          this.executor.prisma,
          serviceId,
          input,
          await this.executor.onboardingConfigurationLoader.load(),
          this.executor.providers(),
          context,
        ),
      ),
    );
  }

  saveApprovalsStep(
    serviceId: string,
    input: SaveOnboardingApprovalsStepInput,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await saveOnboardingApprovalsStep(
          this.executor.prisma,
          serviceId,
          input,
          await this.executor.onboardingConfigurationLoader.load(),
          this.executor.providers(),
          context,
        ),
      ),
    );
  }

  completeServiceStep(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.complete(serviceId, 'SERVICE', context);
  }

  completeFormStep(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.complete(serviceId, 'FORM', context);
  }

  completeRoutingStep(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.complete(serviceId, 'ROUTING', context);
  }

  completeSlaStep(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.complete(serviceId, 'SLA', context);
  }

  completeApprovalsStep(
    serviceId: string,
    context: OnboardingMutationContext = emptyOnboardingContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.complete(serviceId, 'APPROVALS', context);
  }

  private complete(
    serviceId: string,
    step: ServiceOnboardingStep,
    context: OnboardingMutationContext,
  ): Promise<ServiceOnboardingResponse> {
    return this.executor.execute(async () =>
      this.executor.respond(
        await completeOnboardingStep(
          this.executor.prisma,
          serviceId,
          step,
          await this.executor.onboardingConfigurationLoader.load(),
          this.executor.providers(),
          context,
        ),
      ),
    );
  }
}
