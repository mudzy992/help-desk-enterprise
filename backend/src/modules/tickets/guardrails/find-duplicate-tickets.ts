import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../tickets.types';
import { descriptionSimilarity } from './description-similarity';
import type {
  DuplicateTicketMatch,
  TicketGuardrailsConfiguration,
} from './guardrails.types';

export async function findDuplicateTickets(input: {
  readonly prisma: PrismaService;
  readonly configuration: TicketGuardrailsConfiguration;
  readonly requesterId: string;
  readonly serviceId: string;
  readonly description: string;
  readonly now?: Date;
}): Promise<readonly DuplicateTicketMatch[]> {
  if (!input.configuration.enabled) {
    return [];
  }
  const now = input.now ?? new Date();
  const windowStart = new Date(
    now.getTime() - input.configuration.duplicateWindowMinutes * 60_000,
  );
  const recent = (await input.prisma.ticket.findMany({
    where: {
      requesterId: input.requesterId,
      serviceId: input.serviceId,
    },
  })) as TicketRecord[];
  return recent
    .filter(
      (ticket) =>
        ticket.parentTicketId === null &&
        ticket.reopenedFromTicketId === null &&
        ticket.createdAt.getTime() >= windowStart.getTime(),
    )
    .map((ticket) => ({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      similarity: descriptionSimilarity(input.description, ticket.description),
    }))
    .filter(
      (match) => match.similarity >= input.configuration.similarityThreshold,
    )
    .sort((left, right) => right.similarity - left.similarity);
}
