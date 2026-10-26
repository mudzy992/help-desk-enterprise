import type { Prisma } from "../../../generated/prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { TicketPersistedMessageSink } from "../collaboration.types";

/**
 * Keeps a guardrail claim and its protected DB effect in one commit boundary.
 * A failed transaction also rewinds the in-memory realtime message sink so a
 * caller cannot publish events whose rows were rolled back.
 */
export async function runGuardrailEffectTransaction<T>(input: {
  readonly prisma: PrismaService;
  readonly messages?: TicketPersistedMessageSink;
  readonly operation: (transaction: Prisma.TransactionClient) => Promise<T>;
}): Promise<T> {
  const messageCount = input.messages?.length ?? 0;
  try {
    return await input.prisma.$transaction(input.operation);
  } catch (error) {
    input.messages?.splice(messageCount);
    throw error;
  }
}
