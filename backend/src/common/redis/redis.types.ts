export interface RedisConfiguration {
  readonly host: string;
  readonly port: number;
  readonly username: string | undefined;
  readonly password: string | undefined;
  readonly keyPrefix: string;
  readonly queuePrefix: string;
  readonly tls?: {
    readonly ca: string;
    readonly servername: string;
    readonly rejectUnauthorized: true;
  };
  readonly deploymentEnvironment?: string;
}

export interface ClosableRedisClient {
  readonly status: string;
  quit(): Promise<unknown>;
  disconnect(): void;
}

export interface BullMqRootConfiguration {
  readonly connection: {
    readonly host: string;
    readonly port: number;
    readonly username: string | undefined;
    readonly password: string | undefined;
    readonly maxRetriesPerRequest: null;
    readonly lazyConnect: true;
    readonly tls: RedisConfiguration['tls'];
  };
  readonly prefix: string;
}
