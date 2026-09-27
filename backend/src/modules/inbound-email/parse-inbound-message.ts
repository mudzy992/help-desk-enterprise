import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import type { InboundMessage } from './inbound-email.types';

function firstAddress(value: AddressObject | AddressObject[] | undefined) {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  for (const group of list) {
    for (const entry of group.value) {
      if (typeof entry.address === 'string' && entry.address.includes('@')) {
        return { address: entry.address.trim().toLowerCase(), name: entry.name?.trim() || null };
      }
    }
  }
  return null;
}

function headerMap(parsed: ParsedMail): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of parsed.headerLines ?? []) {
    const name = line.key.toLowerCase();
    const separator = line.line.indexOf(':');
    const value = (separator >= 0 ? line.line.slice(separator + 1) : line.line).replace(/\r?\n[ \t]+/g, ' ').trim();
    map.set(name, [...(map.get(name) ?? []), value]);
  }
  return map;
}

/** Paket 2.3: raw RFC 5322 → connector-independent message. */
export async function parseInboundMessage(raw: Buffer): Promise<InboundMessage> {
  const parsed = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
  const from = firstAddress(parsed.from);
  const references = Array.isArray(parsed.references)
    ? parsed.references
    : typeof parsed.references === 'string'
      ? parsed.references.split(/\s+/).filter(Boolean)
      : [];
  return {
    messageId: parsed.messageId ?? null,
    inReplyTo: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : null,
    references,
    fromAddress: from?.address ?? null,
    fromName: from?.name ?? null,
    subject: (parsed.subject ?? '').trim(),
    // mailparser derives text from HTML when there is no text part.
    text: (parsed.text ?? '').replace(/\r\n/g, '\n'),
    receivedAt: parsed.date ?? null,
    headers: headerMap(parsed),
    attachments: (parsed.attachments ?? []).map((attachment) => ({
      filename: attachment.filename ?? 'attachment',
      contentType: attachment.contentType ?? 'application/octet-stream',
      size: attachment.size ?? attachment.content.length,
      content: attachment.content,
      inline: attachment.contentDisposition === 'inline' || attachment.related === true || Boolean(attachment.cid),
    })),
  };
}
