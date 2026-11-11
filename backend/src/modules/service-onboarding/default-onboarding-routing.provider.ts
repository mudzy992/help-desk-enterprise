import { Injectable } from '@nestjs/common';
import type { ServiceRoutingCoverageEvaluation } from '../routing/evaluate-service-routing-coverage';
import { parseConfigurationReference } from './parse-configuration-reference';
import type {
  ConfigurationReferenceValidation,
  ServiceOnboardingRoutingProvider,
} from './service-onboarding.types';

@Injectable()
export class DefaultOnboardingRoutingProvider
  implements ServiceOnboardingRoutingProvider
{
  async validate(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<ConfigurationReferenceValidation> {
    return {
      reference: parseConfigurationReference(
        input.reference,
        'INVALID_ROUTING_CONFIGURATION_REF',
      ),
      resolvedEntityId: null,
    };
  }

  async suggest(_serviceId: string): Promise<string | null> {
    return null;
  }

  async evaluateActivationCoverage(
    _serviceId: string,
  ): Promise<ServiceRoutingCoverageEvaluation | null> {
    return null;
  }
}
