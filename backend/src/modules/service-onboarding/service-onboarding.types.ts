import type {
  ServiceLifecycle,
  ServiceOnboardingStatus,
  ServiceOnboardingStep,
} from '../../generated/prisma/enums';
import type { CatalogMutationContext } from '../service-catalog/service-catalog.types';
import type { CreateServiceInput, UpdateServiceInput } from '../service-catalog/service-catalog.types';

export type ServiceOnboardingConfiguration = {
  readonly enabled: boolean;
  readonly requireValidationBeforeActivate: boolean;
  readonly autoFillRoutingEnabled: boolean;
  readonly autoFillRoutingRequireConfirm: boolean;
};

export type ServiceOnboardingRecord = {
  readonly id: string;
  readonly serviceId: string;
  readonly status: ServiceOnboardingStatus;
  readonly currentStep: ServiceOnboardingStep;
  readonly formVersionRef: string | null;
  readonly routingConfigurationRef: string | null;
  readonly slaConfigurationRef: string | null;
  readonly approvalsConfigurationRef: string | null;
  readonly completedSteps: readonly ServiceOnboardingStep[];
  readonly lastValidationErrors: readonly ServiceOnboardingValidationIssue[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ServiceOnboardingValidationIssue = {
  readonly code: string;
  readonly step?: ServiceOnboardingStep;
};

export type ConfigurationReferenceValidation = {
  readonly reference: string;
  readonly resolvedEntityId: string | null;
};

export type ApprovalsConfigurationValidation = {
  readonly reference: string;
  readonly requiresApproval: boolean;
};

export type ServiceOnboardingRoutingProvider = {
  validate(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<ConfigurationReferenceValidation>;
  suggest(serviceId: string): Promise<string | null>;
  evaluateActivationCoverage(
    serviceId: string,
  ): Promise<'ROUTING_COVERAGE_MISSING' | null>;
};

export type ServiceOnboardingSlaProvider = {
  validate(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<ConfigurationReferenceValidation>;
};

export type ServiceOnboardingApprovalsProvider = {
  validate(input: {
    readonly serviceId: string;
    readonly reference: string;
    readonly requiresApproval: boolean;
  }): Promise<ApprovalsConfigurationValidation>;
};

export type ServiceOnboardingResponse = {
  readonly id: string;
  readonly serviceId: string;
  readonly status: ServiceOnboardingStatus;
  readonly currentStep: ServiceOnboardingStep;
  readonly completedSteps: readonly ServiceOnboardingStep[];
  readonly formVersionRef: string | null;
  readonly routingConfigurationRef: string | null;
  readonly slaConfigurationRef: string | null;
  readonly approvalsConfigurationRef: string | null;
  readonly routingSuggestion: string | null;
  readonly lastValidationErrors: readonly ServiceOnboardingValidationIssue[];
  readonly serviceLifecycle: ServiceLifecycle;
  readonly warnings: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateServiceOnboardingInput = CreateServiceInput;
export type SaveOnboardingServiceStepInput = UpdateServiceInput;

export type SaveOnboardingFormStepInput = {
  readonly formVersionRef: string;
};

export type SaveOnboardingRoutingStepInput = {
  readonly routingConfigurationRef: string;
};

export type SaveOnboardingSlaStepInput = {
  readonly slaConfigurationRef: string;
};

export type SaveOnboardingApprovalsStepInput = {
  readonly approvalsConfigurationRef: string;
};

export type OnboardingMutationContext = CatalogMutationContext;
