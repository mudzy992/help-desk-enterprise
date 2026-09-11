import { Injectable } from '@nestjs/common';
import { TicketArchiveConfigurationLoader } from './archive/ticket-archive-configuration.loader';
import { TicketConfidentialConfigurationLoader } from './confidential/ticket-confidential-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from './safe-logging/ticket-safe-logging-configuration.loader';
import type { TicketMutationContext } from './tickets.types';
import {
  withTicketAccessPolicies,
  type TicketAccessPolicyContext,
} from './with-ticket-access-policies';

@Injectable()
export class TicketAccessPolicyBinder {
  constructor(
    private readonly confidentialLoader: TicketConfidentialConfigurationLoader,
    private readonly safeLoggingLoader: TicketSafeLoggingConfigurationLoader,
    private readonly archiveLoader: TicketArchiveConfigurationLoader,
  ) {}

  bind(context: TicketMutationContext): Promise<TicketAccessPolicyContext> {
    return withTicketAccessPolicies(context, {
      confidential: this.confidentialLoader,
      safeLogging: this.safeLoggingLoader,
      archive: this.archiveLoader,
    });
  }
}
