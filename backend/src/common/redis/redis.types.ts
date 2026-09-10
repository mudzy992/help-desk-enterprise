export interface RedisConfiguration {
  readonly host: string;
  readonly port: number;
  readonly username: string | undefined;
  readonly password: string | undefined;
  readonly keyPrefix: string;
  readonly queuePrefix: string;
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
  };
  readonly prefix: string;
}
