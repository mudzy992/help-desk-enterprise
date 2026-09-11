import type { TicketArchiveConfiguration } from './archive/archive.types';
import type { TicketConfidentialConfiguration } from './confidential/confidential.types';
import type { TicketSafeLoggingConfiguration } from './safe-logging/safe-logging.types';
import type { TicketMutationContext } from './tickets.types';

export type TicketAccessPolicyContext = TicketMutationContext & {
  readonly confidential: TicketConfidentialConfiguration;
  readonly safeLogging: TicketSafeLoggingConfiguration;
  readonly archive: TicketArchiveConfiguration;
};

export async function withTicketAccessPolicies(
  context: TicketMutationContext,
  loaders: {
    readonly confidential: { load: () => Promise<TicketConfidentialConfiguration> };
    readonly safeLogging: { load: () => Promise<TicketSafeLoggingConfiguration> };
    readonly archive: { load: () => Promise<TicketArchiveConfiguration> };
  },
): Promise<TicketAccessPolicyContext> {
  const [confidential, safeLogging, archive] = await Promise.all([
    loaders.confidential.load(),
    loaders.safeLogging.load(),
    loaders.archive.load(),
  ]);
  return {
    ...context,
    confidential,
    safeLogging,
    archive,
  };
}
