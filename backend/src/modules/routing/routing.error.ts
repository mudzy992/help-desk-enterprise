export type RoutingErrorCode =
  | 'ORIGIN_UNIT_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'GROUP_NOT_FOUND'
  | 'DUPLICATE_RULE'
  | 'UNAVAILABLE';

export class RoutingError extends Error {
  constructor(
    readonly code: RoutingErrorCode,
    message = code,
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}
