import { Injectable } from '@nestjs/common';
import { TicketArchiveConfigurationLoader } from './archive/ticket-archive-configuration.loader';
import { TicketConfidentialConfigurationLoader } from './confidential/ticket-confidential-configuration.loader';
import { TicketSafeLoggingConfigurationLoader } from './safe-logging/ticket-safe-logging-configuration.loader';
import { TicketSlaTimersService } from '../sla/ticket-sla-timers.service';
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
    private readonly slaTimers: TicketSlaTimersService,
  ) {}

  async bind(context: TicketMutationContext): Promise<TicketAccessPolicyContext> {
    const gated = await withTicketAccessPolicies(context, {
      confidential: this.confidentialLoader,
      safeLogging: this.safeLoggingLoader,
      archive: this.archiveLoader,
    });
    return { ...gated, slaTimers: this.slaTimers };
  }
}
