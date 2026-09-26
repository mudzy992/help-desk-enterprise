import { createHash } from 'node:crypto';
import { isConfidentialForEmail, type EmailTicketFacts } from './compose-ticket-email';
import { emailLayoutLabels } from './email-layout-labels';
import type { EmailLocale } from './email-template.constants';
import type { EmailTemplateRegistry } from './email-template.types';
import type { EmailChannelConfiguration } from './load-email-channel-configuration';
import { renderEmailMessage, type EmailDigestRow, type RenderedEmailMessage } from './render-email-message';

export type DigestSourceItem = {
  readonly ticketId: string | null;
  readonly category: string;
  readonly createdAt: Date;
};

export type DigestTicketFacts = EmailTicketFacts;

export type ComposedDigestEmail = RenderedEmailMessage & {
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly ticketCount: number;
};

/**
 * Paket 2.2 (N5): one row per ticket — its latest event and how many events it
 * had — newest first, capped at `maxItems` with an "and N more" line. Tickets
 * that no longer exist are skipped; confidential ones show the number only.
 */
export function buildDigestRows(input: {
  readonly items: readonly DigestSourceItem[];
  readonly tickets: ReadonlyMap<string, DigestTicketFacts>;
  readonly locale: EmailLocale;
  readonly publicUrl: string | null;
  readonly maxItems: number;
}): { readonly rows: EmailDigestRow[]; readonly total: number; readonly more: string | null } {
  const labels = emailLayoutLabels[input.locale];
  const byTicket = new Map<string, { latest: DigestSourceItem; count: number }>();
  for (const item of input.items) {
    if (item.ticketId === null || !input.tickets.has(item.ticketId)) continue;
    const current = byTicket.get(item.ticketId);
    if (current === undefined) {
      byTicket.set(item.ticketId, { latest: item, count: 1 });
    } else {
      current.count += 1;
      if (item.createdAt.getTime() > current.latest.createdAt.getTime()) current.latest = item;
    }
  }
  const ordered = [...byTicket.entries()].sort(
    (left, right) => right[1].latest.createdAt.getTime() - left[1].latest.createdAt.getTime(),
  );
  const rows = ordered.slice(0, input.maxItems).map(([ticketId, entry]): EmailDigestRow => {
    const ticket = input.tickets.get(ticketId) as DigestTicketFacts;
    return {
      ticketNumber: ticket.ticketNumber,
      title: isConfidentialForEmail(ticket) ? '' : ticket.title,
      statusLabel: labels.statuses[ticket.status] ?? ticket.status,
      eventLabel: labels.digestCategories[entry.latest.category] ?? entry.latest.category,
      eventCount: entry.count,
      url: input.publicUrl === null ? null : `${input.publicUrl}/tickets/${encodeURIComponent(ticket.id)}`,
    };
  });
  const hidden = ordered.length - rows.length;
  return {
    rows,
    total: ordered.length,
    more: hidden > 0 ? labels.digestMore.replace('{count}', String(hidden)) : null,
  };
}

export function composeDigestEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientId: string;
  readonly recipientName: string;
  readonly items: readonly DigestSourceItem[];
  readonly tickets: ReadonlyMap<string, DigestTicketFacts>;
  readonly maxItems: number;
  /** Stable per recipient and slot → the same Message-ID on a retry. */
  readonly dedupeKey: string;
}): ComposedDigestEmail {
  const presentation = input.configuration.presentation;
  const digest = buildDigestRows({
    items: input.items,
    tickets: input.tickets,
    locale: input.locale,
    publicUrl: presentation.publicUrl,
    maxItems: input.maxItems,
  });
  const templates = input.templates ?? input.configuration.templates;
  const rendered = renderEmailMessage({
    template: templates[input.locale]['notification.digest'],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      itemCount: String(digest.total),
      appName: presentation.appName,
    },
    appName: presentation.appName,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/tickets`,
    replyMode: 'no_reply',
    manageUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/account/notifications`,
    digest: { rows: digest.rows, more: digest.more },
  });
  const domain = mailDomain(input.configuration.smtp?.fromAddress);
  return {
    ...rendered,
    ticketCount: digest.total,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientId}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: {
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  };
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'ephelpdesk.local';
}
