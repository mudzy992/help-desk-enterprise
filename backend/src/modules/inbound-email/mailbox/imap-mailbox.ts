import { ImapFlow } from 'imapflow';
import { fetchEntraAccessToken, type EntraApplication } from './entra-token';
import {
  inboundMaxRawBytes,
  type InboundMailboxConnector,
  type InboundMailboxDestination,
  type InboundMailboxItem,
  type InboundMailboxSession,
} from './inbound-mailbox';

export type ImapMailboxOptions = {
  readonly host: string;
  readonly port: number;
  readonly tls: boolean;
  readonly username: string;
  readonly password: string;
  /** Office 365 IMAP needs OAuth2 (basic auth is disabled in Exchange Online). */
  readonly entra: EntraApplication | null;
  readonly folders: Readonly<Record<InboundMailboxDestination, string>>;
};

/**
 * Paket 2.3 (R1): IMAP connector (any server; Gmail with an app password).
 * Messages are addressed by UID inside the INBOX; the provider id is
 * `<UIDVALIDITY>:<UID>` so a mailbox rebuild never collides with history.
 */
export class ImapInboundMailbox implements InboundMailboxConnector {
  constructor(private readonly options: ImapMailboxOptions) {}

  async open(): Promise<InboundMailboxSession> {
    const accessToken =
      this.options.entra === null
        ? undefined
        : await fetchEntraAccessToken(this.options.entra, 'https://outlook.office365.com/.default');
    const client = new ImapFlow({
      host: this.options.host,
      port: this.options.port,
      secure: this.options.tls && this.options.port === 993,
      doSTARTTLS: this.options.tls && this.options.port !== 993 ? true : undefined,
      auth: accessToken === undefined
        ? { user: this.options.username, pass: this.options.password }
        : { user: this.options.username, accessToken },
      logger: false,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    });
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const validity = String(client.mailbox === false ? 0 : client.mailbox.uidValidity);
    const ensured = new Set<string>();
    const ensureFolder = async (path: string) => {
      if (ensured.has(path)) return;
      const parts = path.split('/').map((part) => part.trim());
      try {
        await client.mailboxCreate(parts);
      } catch {
        // Exists already (or server-specific delimiter); moving tells us if not.
      }
      ensured.add(path);
    };
    return {
      list: async (limit: number): Promise<readonly InboundMailboxItem[]> => {
        const uids = ((await client.search({ all: true }, { uid: true })) || []).slice(0, limit);
        const items: InboundMailboxItem[] = [];
        for (const uid of uids) {
          const message = await client.fetchOne(String(uid), { size: true, source: true }, { uid: true });
          if (message === false || message === undefined) continue;
          const tooLarge = (message.size ?? 0) > inboundMaxRawBytes;
          items.push({
            providerMessageId: `${validity}:${uid}`,
            raw: tooLarge || message.source === undefined ? Buffer.alloc(0) : message.source,
          });
        }
        return items;
      },
      move: async (providerMessageId: string, destination: InboundMailboxDestination): Promise<void> => {
        const uid = providerMessageId.split(':')[1] ?? '';
        const path = this.options.folders[destination];
        await ensureFolder(path);
        const moved = await client.messageMove(uid, path.split('/').map((part) => part.trim()), { uid: true });
        if (moved === false) throw new Error(`IMAP_MOVE_FAILED ${path}`);
      },
      close: async () => {
        lock.release();
        await client.logout().catch(() => undefined);
      },
    };
  }
}
