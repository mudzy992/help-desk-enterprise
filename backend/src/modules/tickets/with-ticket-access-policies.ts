import type { TicketConfidentialConfiguration } from './confidential/confidential.types';
import type { TicketSafeLoggingConfiguration } from './safe-logging/safe-logging.types';
import type { TicketMutationContext } from './tickets.types';

export type TicketAccessPolicyContext = TicketMutationContext & {
  readonly confidential: TicketConfidentialConfiguration;
  readonly safeLogging: TicketSafeLoggingConfiguration;
};

export async function withTicketAccessPolicies(
  context: TicketMutationContext,
  loaders: {
    readonly confidential: { load: () => Promise<TicketConfidentialConfiguration> };
    readonly safeLogging: { load: () => Promise<TicketSafeLoggingConfiguration> };
  },
): Promise<TicketAccessPolicyContext> {
  const [confidential, safeLogging] = await Promise.all([
    loaders.confidential.load(),
    loaders.safeLogging.load(),
  ]);
  return {
    ...context,
    confidential,
    safeLogging,
  };
}
