import type { InboundEmailConfiguration } from '../inbound-email-configuration';
import { GraphInboundMailbox } from './graph-mailbox';
import { ImapInboundMailbox } from './imap-mailbox';
import type { InboundMailboxConnector } from './inbound-mailbox';

export function createInboundMailbox(configuration: InboundEmailConfiguration): InboundMailboxConnector {
  const folders = { processed: configuration.processedFolder, rejected: configuration.rejectedFolder };
  if (configuration.provider === 'graph') {
    return new GraphInboundMailbox({ application: configuration.graph, mailbox: configuration.address, folders });
  }
  return new ImapInboundMailbox({
    host: configuration.imap.host,
    port: configuration.imap.port,
    tls: configuration.imap.tls,
    username: configuration.imap.username,
    password: configuration.imap.password,
    entra: configuration.imap.authMethod === 'oauth2_entra' ? configuration.graph : null,
    folders,
  });
}
