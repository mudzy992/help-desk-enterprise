import { readFileSync } from 'node:fs';
import { Client, type Entry } from 'ldapts';

/**
 * Paket 1.8 (A3): the only LDAP surface the application uses — bind and
 * paged subtree search. Read-only by construction: there is no write method.
 */
export type LdapEntry = Readonly<Record<string, string | string[] | Buffer | Buffer[]>>;

export interface LdapDirectoryClient {
  search(input: {
    readonly baseDn: string;
    readonly filter: string;
    readonly attributes: readonly string[];
    readonly pageSize: number;
    readonly sizeLimit?: number;
    readonly scope?: 'base' | 'sub';
  }): Promise<LdapEntry[]>;
  close(): Promise<void>;
}

export type LdapsConnectionSettings = {
  readonly urls: readonly string[];
  readonly bindDn: string;
  readonly bindPassword: string;
  readonly caCertificatePem: string | null;
  readonly connectTimeoutMilliseconds: number;
  readonly operationTimeoutMilliseconds: number;
};

export type LdapClientFactory = (
  url: string,
  settings: LdapsConnectionSettings,
) => Promise<LdapDirectoryClient>;

export type ConnectedLdapClient = {
  readonly client: LdapDirectoryClient;
  readonly url: string;
  readonly attempts: readonly { readonly url: string; readonly errorCode: string }[];
};

/** Tries every configured domain controller in order (failover). */
export async function connectWithFailover(
  settings: LdapsConnectionSettings,
  factory: LdapClientFactory = createLdaptsClient,
): Promise<ConnectedLdapClient> {
  const attempts: { url: string; errorCode: string }[] = [];
  for (const url of settings.urls) {
    try {
      const client = await factory(url, settings);
      return { client, url, attempts };
    } catch (error) {
      attempts.push({ url, errorCode: classifyLdapError(error) });
    }
  }
  throw new LdapConnectionError(attempts);
}

export class LdapConnectionError extends Error {
  constructor(readonly attempts: readonly { readonly url: string; readonly errorCode: string }[]) {
    super('DIRECTORY_CONNECTION_FAILED');
    this.name = 'LdapConnectionError';
  }

  /** The most useful single reason for the UI (first non-network wins). */
  get errorCode(): string {
    return (
      this.attempts.find((attempt) => attempt.errorCode !== 'NETWORK')?.errorCode ??
      this.attempts[0]?.errorCode ??
      'NO_DOMAIN_CONTROLLER'
    );
  }
}

/** Stable, secret-free error codes (never the server message). */
export function classifyLdapError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? '';
  const code = (error as { code?: string | number })?.code;
  const message = String((error as { message?: string })?.message ?? '');
  if (name === 'InvalidCredentialsError' || code === 49) return 'INVALID_BIND_CREDENTIALS';
  if (name === 'InsufficientAccessError' || code === 50) return 'INSUFFICIENT_ACCESS';
  if (name === 'NoSuchObjectError' || code === 32) return 'BASE_DN_NOT_FOUND';
  if (name === 'SizeLimitExceededError' || code === 4) return 'SIZE_LIMIT_EXCEEDED';
  if (name === 'TimeLimitExceededError' || /timeout/i.test(message)) return 'TIMEOUT';
  if (
    /certificate|self[- ]signed|UNABLE_TO_VERIFY|CERT_|altnames/i.test(message) ||
    (typeof code === 'string' && /CERT|SELF_SIGNED/.test(code))
  ) {
    return 'TLS_CERTIFICATE';
  }
  if (typeof code === 'string' && /ECONN|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN/.test(code)) {
    return 'NETWORK';
  }
  return 'LDAP_ERROR';
}

export function readCaCertificate(path: string | undefined): string | null {
  const trimmed = path?.trim();
  if (!trimmed) {
    return null;
  }
  return readFileSync(trimmed, 'utf8');
}

export const createLdaptsClient: LdapClientFactory = async (url, settings) => {
  const client = new Client({
    url,
    timeout: settings.operationTimeoutMilliseconds,
    connectTimeout: settings.connectTimeoutMilliseconds,
    strictDN: false,
    tlsOptions: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ...(settings.caCertificatePem ? { ca: [settings.caCertificatePem] } : {}),
    },
  });
  try {
    await client.bind(settings.bindDn, settings.bindPassword);
  } catch (error) {
    await client.unbind().catch(() => undefined);
    throw error;
  }
  return {
    async search(input) {
      const { searchEntries } = await client.search(input.baseDn, {
        scope: input.scope ?? 'sub',
        filter: input.filter,
        attributes: [...input.attributes],
        ...(input.scope === 'base' ? {} : { paged: { pageSize: input.pageSize } }),
        sizeLimit: input.sizeLimit ?? 0,
        explicitBufferAttributes: ['objectGUID'],
      });
      return searchEntries.map((entry: Entry) => entry as unknown as LdapEntry);
    },
    async close() {
      await client.unbind().catch(() => undefined);
    },
  };
};
