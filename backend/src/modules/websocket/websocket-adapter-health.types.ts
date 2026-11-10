export type WebsocketAdapterHealthState = 'starting' | 'healthy' | 'degraded';

export type WebsocketAdapterHealthReason =
  | 'startup'
  | 'redis_unconfigured'
  | 'acl_denied'
  | 'client_creation_failed'
  | 'connection_error'
  | 'publish_rejected'
  | 'subscribe_rejected'
  | 'probe_failed'
  | 'probe_timeout'
  | 'probe_ok'
  | 'adapter_install_failed';

export type WebsocketAdapterHealthListener = (
  state: Exclude<WebsocketAdapterHealthState, 'starting'>,
  reason: WebsocketAdapterHealthReason,
) => void;

export type WebsocketAdapterFailureListener = (
  reason: WebsocketAdapterHealthReason,
) => void;
