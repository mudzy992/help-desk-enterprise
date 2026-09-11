import { routingConfigurationReferencePrefix } from './routing.constants';

export function buildRoutingConfigurationReference(serviceId: string): string {
  return `${routingConfigurationReferencePrefix}${serviceId}`;
}

export function isRoutingConfigurationReferenceForService(
  reference: string,
  serviceId: string,
): boolean {
  return reference === buildRoutingConfigurationReference(serviceId);
}
