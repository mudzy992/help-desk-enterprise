export const routingOutcomes = {
  exact: 'EXACT',
  parentFallback: 'PARENT_FALLBACK',
  unrouted: 'UNROUTED',
} as const;

export const routingConfigurationReferencePrefix = 'routing:';

export const defaultRoutingConfiguration = {
  unroutedQueueEnabled: true,
  unroutedQueueOwnerRole: 'SUPER_ADMIN',
  requireCoverage: true,
} as const;

export const routingCoverageMissingCode = 'ROUTING_COVERAGE_MISSING' as const;
export const routingListDefaultTake = 25;
export const routingListMaximumTake = 100;

export const routingCoverageDefaultTake = 50;
export const routingCoverageMaximumTake = 50;
/** Hard response-work limits; pages never split one service across cursors. */
export const routingCoverageMaximumItems = 500;
export const routingCoverageMaximumBytes = 1_000_000;
export const routingCoverageMaximumDurationMs = 5_000;
