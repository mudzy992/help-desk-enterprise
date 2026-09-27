import { fetchEntraAccessToken, type EntraApplication } from './entra-token';
import {
  inboundMaxRawBytes,
  type InboundMailboxConnector,
  type InboundMailboxDestination,
  type InboundMailboxItem,
  type InboundMailboxSession,
} from './inbound-mailbox';

const graphBase = 'https://graph.microsoft.com/v1.0';

/**
 * Paket 2.3 (R1): Microsoft Graph connector. Application permission
 * Mail.ReadWrite, restricted to the support mailbox with an Application
 * Access Policy / RBAC for Applications (docs/ops/inbound-email.md).
 */
export class GraphInboundMailbox implements InboundMailboxConnector {
  constructor(
    private readonly options: {
      readonly application: EntraApplication;
      readonly mailbox: string;
      readonly folders: Readonly<Record<InboundMailboxDestination, string>>;
      readonly fetchImpl?: typeof fetch;
    },
  ) {}

  async open(): Promise<InboundMailboxSession> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const token = await fetchEntraAccessToken(this.options.application, 'https://graph.microsoft.com/.default', fetchImpl);
    const user = `${graphBase}/users/${encodeURIComponent(this.options.mailbox)}`;
    const call = async (path: string, init: RequestInit = {}): Promise<Response> => {
      const response = await fetchImpl(`${user}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`GRAPH_${response.status} ${path.split('?')[0]} ${detail.slice(0, 200)}`);
      }
      return response;
    };
    const folderIds = new Map<InboundMailboxDestination, string>();
    const resolveFolder = async (destination: InboundMailboxDestination): Promise<string> => {
      const known = folderIds.get(destination);
      if (known !== undefined) return known;
      let parentPath = '/mailFolders/inbox';
      let id = '';
      for (const name of this.options.folders[destination].split('/').map((part) => part.trim())) {
        const escaped = name.replace(/'/g, "''");
        const list = (await (
          await call(`${parentPath}/childFolders?$filter=displayName eq '${encodeURIComponent(escaped)}'&$select=id`)
        ).json()) as { value?: { id: string }[] };
        id =
          list.value?.[0]?.id ??
          ((await (await call(`${parentPath}/childFolders`, { method: 'POST', body: JSON.stringify({ displayName: name }) })).json()) as { id: string }).id;
        parentPath = `/mailFolders/${encodeURIComponent(id)}`;
      }
      folderIds.set(destination, id);
      return id;
    };
    return {
      list: async (limit: number): Promise<readonly InboundMailboxItem[]> => {
        const page = (await (
          await call(`/mailFolders/inbox/messages?$top=${Math.min(limit, 100)}&$orderby=receivedDateTime asc&$select=id,size`)
        ).json()) as { value?: { id: string; size?: number }[] };
        const items: InboundMailboxItem[] = [];
        for (const entry of page.value ?? []) {
          if ((entry.size ?? 0) > inboundMaxRawBytes) {
            items.push({ providerMessageId: entry.id, raw: Buffer.alloc(0) });
            continue;
          }
          const raw = Buffer.from(await (await call(`/messages/${encodeURIComponent(entry.id)}/$value`)).arrayBuffer());
          items.push({ providerMessageId: entry.id, raw });
        }
        return items;
      },
      move: async (providerMessageId: string, destination: InboundMailboxDestination): Promise<void> => {
        const destinationId = await resolveFolder(destination);
        await call(`/messages/${encodeURIComponent(providerMessageId)}/move`, {
          method: 'POST',
          body: JSON.stringify({ destinationId }),
        });
      },
      close: async () => undefined,
    };
  }
}
