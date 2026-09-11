export const routingOutcomes = {
  exact: 'EXACT',
  parentFallback: 'PARENT_FALLBACK',
  unrouted: 'UNROUTED',
} as const;

export const routingConfigurationReferencePrefix = 'routing:';

export const defaultRoutingConfiguration = {
  unroutedQueueEnabled: true,
  unroutedQueueOwnerRole: 'SUPER_ADMIN',
} as const;
