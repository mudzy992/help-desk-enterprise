import type { TicketArchiveConfiguration } from './archive/archive.types';
import type { TicketPriorityMatrixConfiguration } from './priority/ticket-priority-matrix-configuration.loader';
import type { TicketConfidentialConfiguration } from './confidential/confidential.types';
import type { TicketSafeLoggingConfiguration } from './safe-logging/safe-logging.types';
import type { TicketMutationContext } from './tickets.types';

export type TicketAccessPolicyContext = TicketMutationContext & {
  readonly confidential: TicketConfidentialConfiguration;
  readonly safeLogging: TicketSafeLoggingConfiguration;
  readonly archive: TicketArchiveConfiguration;
  /** M7 B5: resolved once per mutation, next to the other access policies. */
  readonly priorityMatrix: TicketPriorityMatrixConfiguration;
};

export async function withTicketAccessPolicies(
  context: TicketMutationContext,
  loaders: {
    readonly confidential: { load: () => Promise<TicketConfidentialConfiguration> };
    readonly safeLogging: { load: () => Promise<TicketSafeLoggingConfiguration> };
    readonly archive: { load: () => Promise<TicketArchiveConfiguration> };
    readonly priorityMatrix?: {
      load: () => Promise<TicketPriorityMatrixConfiguration>;
    };
  },
): Promise<TicketAccessPolicyContext> {
  const [confidential, safeLogging, archive, priorityMatrix] = await Promise.all([
    loaders.confidential.load(),
    loaders.safeLogging.load(),
    loaders.archive.load(),
    loaders.priorityMatrix?.load() ?? Promise.resolve({ enabled: true }),
  ]);
  return {
    ...context,
    confidential,
    safeLogging,
    archive,
    priorityMatrix,
    // An explicit value on the context (workers, harnesses) wins over the
    // setting; the setting fills the gap for HTTP-driven mutations.
    priorityMatrixEnabled: context.priorityMatrixEnabled ?? priorityMatrix.enabled,
  };
}
