export type RoutingErrorCode =
  | 'ORIGIN_UNIT_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'GROUP_NOT_FOUND'
  | 'RULE_NOT_FOUND'
  | 'DUPLICATE_RULE'
  | 'ROUTING_RULE_CONFLICT'
  | 'REASON_REQUIRED'
  | 'ROUTING_COVERAGE_MISSING'
  | 'UNAVAILABLE';

export class RoutingError extends Error {
  constructor(
    readonly code: RoutingErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}
