import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import { defaultTicketConfidentialConfiguration } from './confidential.constants';
import type {
  ConfidentialAccessFacts,
  TicketConfidentialConfiguration,
} from './confidential.types';
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
  // A ticket that is not confidential (or a disabled feature) is decided without a
  // single fact — `evaluateConfidentialTicketAccess` answers `not_confidential` before
  // it reads any. Loading them anyway cost four queries on every ticket detail.
  if (!configuration.enabled || !input.ticket.isConfidential) {
    return evaluateConfidentialTicketAccess({
      isConfidential: input.ticket.isConfidential,
      configuration,
      facts: notLoadedConfidentialFacts,
    });
  }
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

/** Never read: the short-circuit above only runs when no fact can matter. */
const notLoadedConfidentialFacts: ConfidentialAccessFacts = {
  isRequester: false,
  isAssignee: false,
  isHandlerGroupMember: false,
  isExplicitParticipant: false,
  hasUserGrant: false,
  hasGroupGrant: false,
  hasAllowedViewerRole: false,
  hasAllowedViewerGroup: false,
  hasActiveBreakGlass: false,
  canInvokeBreakGlass: false,
};
