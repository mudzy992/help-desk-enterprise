import { Injectable } from '@nestjs/common';
import { RoutingService } from '../routing/routing.service';
import { parseConfigurationReference } from './parse-configuration-reference';
import type {
  ConfigurationReferenceValidation,
  ServiceOnboardingRoutingProvider,
} from './service-onboarding.types';
import { ServiceOnboardingError } from './service-onboarding.error';

@Injectable()
export class PersistedOnboardingRoutingProvider
  implements ServiceOnboardingRoutingProvider
{
  constructor(private readonly routingService: RoutingService) {}

  async validate(input: {
    readonly serviceId: string;
    readonly reference: string;
  }): Promise<ConfigurationReferenceValidation> {
    const reference = parseConfigurationReference(
      input.reference,
      'INVALID_ROUTING_CONFIGURATION_REF',
    );
    const accepted = await this.routingService.acceptsOnboardingReference({
      serviceId: input.serviceId,
      reference,
    });
    if (!accepted) {
      throw new ServiceOnboardingError('INVALID_ROUTING_CONFIGURATION_REF');
    }
    return {
      reference,
      resolvedEntityId: input.serviceId,
    };
  }

  async suggest(serviceId: string): Promise<string | null> {
    return this.routingService.suggestOnboardingReference(serviceId);
  }
}
