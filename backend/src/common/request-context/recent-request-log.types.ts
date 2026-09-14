export type RecentRequestLogLevel =
  | 'log'
  | 'error'
  | 'warn'
  | 'debug'
  | 'verbose'
  | 'fatal';

export type RecentRequestLogEntry = {
  readonly timestamp: string;
  readonly level: RecentRequestLogLevel;
  readonly context: string | null;
  readonly message: string;
  readonly requestId: string | null;
};
