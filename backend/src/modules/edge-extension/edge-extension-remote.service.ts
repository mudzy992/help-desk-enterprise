import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { SettingsService } from '../settings/settings.service';
import {
  acknowledgeEdgeRemoteRequest,
  type EdgeRemoteAcknowledgeResponse,
} from './acknowledge-edge-remote-request';
import { executeEdgeExtensionOperation } from './execute-edge-extension-operation';
import { listPendingEdgeRemoteTicketIds } from './list-pending-edge-remote-ticket-ids';
import { loadEdgeExtensionConfiguration } from './load-edge-extension-configuration';

@Injectable()
export class EdgeExtensionRemoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  pendingTicketIds(
    principal: AuthorizationPrincipal,
  ): Promise<{ readonly ticketIds: readonly string[] }> {
    return executeEdgeExtensionOperation(async () => ({
      ticketIds: await listPendingEdgeRemoteTicketIds(
        this.prisma,
        principal.subjectId,
      ),
    }));
  }

  acknowledge(
    principal: AuthorizationPrincipal,
    ticketId: string,
  ): Promise<EdgeRemoteAcknowledgeResponse> {
    return executeEdgeExtensionOperation(async () =>
      acknowledgeEdgeRemoteRequest(
        this.prisma,
        principal,
        ticketId,
        await loadEdgeExtensionConfiguration(this.settingsService),
      ),
    );
  }
}
