import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { defaultTicketConfidentialConfiguration } from './confidential.constants';
import type { TicketConfidentialConfiguration } from './confidential.types';
import { evaluateConfidentialTicketAccess } from './evaluate-confidential-ticket-access';
import { loadConfidentialAccessFacts } from './load-confidential-access-facts';

export async function assertConfidentialTicketAccess(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
    readonly configuration?: TicketConfidentialConfiguration;
    readonly now?: Date;
  },
): Promise<void> {
  const decision = await resolveConfidentialTicketAccess(prisma, input);
  if (decision.allowed) {
    return;
  }
  if (decision.breakGlassAvailable) {
    throw new TicketsError('CONFIDENTIAL_ACCESS_DENIED', undefined, {
      breakGlassAvailable: true,
    });
  }
  throw new TicketsError('FORBIDDEN');
}

export async function resolveConfidentialTicketAccess(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
    readonly configuration?: TicketConfidentialConfiguration;
    readonly now?: Date;
  },
) {
  const configuration =
    input.configuration ?? defaultTicketConfidentialConfiguration;
  const facts = await loadConfidentialAccessFacts(prisma, {
    context: input.context,
    ticket: input.ticket,
    originUnitPath: input.originUnitPath,
    configuration,
    now: input.now,
  });
  return evaluateConfidentialTicketAccess({
    isConfidential: input.ticket.isConfidential,
    configuration,
    facts,
  });
}

export async function isConfidentialTicketVisible(
  prisma: PrismaService,
  input: {
    readonly context: AuthorizationContext;
    readonly ticket: TicketRecord;
    readonly originUnitPath: string;
    readonly configuration?: TicketConfidentialConfiguration;
    readonly now?: Date;
  },
): Promise<boolean> {
  const decision = await resolveConfidentialTicketAccess(prisma, input);
  return decision.allowed;
}
