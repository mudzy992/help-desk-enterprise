import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadEdgeExtensionConfiguration } from '../../edge-extension/load-edge-extension-configuration';
import { SettingsService } from '../../settings/settings.service';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishForTicketId } from '../publish-for-ticket-id';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import type { TicketMutationContext } from '../tickets.types';
import { requestTicketRemote } from './request-ticket-remote';
import type { TicketRemoteRequestResponse } from './remote.types';

@Injectable()
export class TicketsRemoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly settingsService: SettingsService,
  ) {}

  requestRemote(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketRemoteRequestResponse> {
    return executeTicketOperation(async () => {
      const configuration = await loadEdgeExtensionConfiguration(
        this.settingsService,
      );
      const result = await requestTicketRemote(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
        {
          enabled: configuration.remoteEnabled,
          rateLimitMinutes: configuration.remoteRateLimitMinutesPerTicket,
        },
      );
      await publishForTicketId(this.prisma, this.realtimeHub, ticketId, [
        result.message,
      ]);
      return {
        ticketId: result.ticketId,
        requestedAt: result.requestedAt,
        rateLimitMinutes: result.rateLimitMinutes,
      };
    });
  }
}
