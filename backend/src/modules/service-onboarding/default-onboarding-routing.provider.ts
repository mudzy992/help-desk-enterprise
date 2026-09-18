import { Injectable } from '@nestjs/common';
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
  ): Promise<'ROUTING_COVERAGE_MISSING' | null> {
    return null;
  }
}
