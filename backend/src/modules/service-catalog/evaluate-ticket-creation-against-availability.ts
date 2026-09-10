import type {
  ServiceRuntimeAvailability,
  ServiceTicketCreationEligibility,
} from './service-availability.types';

export function evaluateTicketCreationAgainstAvailability(input: {
  readonly serviceId: string;
  readonly runtimeAvailability: ServiceRuntimeAvailability;
}): ServiceTicketCreationEligibility {
  return {
    allowed: true,
    blockedByAvailability: false,
    serviceId: input.serviceId,
    runtimeAvailability: input.runtimeAvailability,
  };
}
