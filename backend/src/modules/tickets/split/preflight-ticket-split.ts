import { PrismaService } from '../../../common/prisma/prisma.service';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import type { SplitTicketInput, TicketSplitConfiguration } from './split.types';

export async function preflightTicketSplit(input: {
  prisma: PrismaService;
  parent: TicketRecord;
  body: SplitTicketInput;
  configuration: TicketSplitConfiguration;
}): Promise<void> {
  const messageIds = unique(input.body.children.flatMap((child) => child.messageIds ?? []));
  const attachmentIds = unique(input.body.children.flatMap((child) => child.attachmentIds ?? []));
  if (messageIds.length > 0 && !input.configuration.allowMessageCopy) throw new TicketsError('SPLIT_NOT_ALLOWED');
  if (input.body.children.some((child) => child.moveAttachments === true) && !input.configuration.allowAttachmentMove) {
    throw new TicketsError('SPLIT_NOT_ALLOWED');
  }
  const moved = input.body.children.flatMap((child) => child.moveAttachments === true ? (child.attachmentIds ?? []) : []);
  if (unique(moved).length !== moved.map((id) => id.trim()).filter(Boolean).length) throw new TicketsError('SPLIT_NOT_ALLOWED');
  const [messages, attachments] = await Promise.all([
    messageIds.length === 0 ? Promise.resolve(0) : input.prisma.ticketMessage.count({ where: { ticketId: input.parent.id, id: { in: messageIds } } }),
    attachmentIds.length === 0 ? Promise.resolve(0) : input.prisma.ticketAttachment.count({ where: { ticketId: input.parent.id, id: { in: attachmentIds } } }),
  ]);
  if (messages !== messageIds.length) throw new TicketsError('NOT_FOUND');
  if (attachments !== attachmentIds.length) throw new TicketsError('ATTACHMENT_NOT_FOUND');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
